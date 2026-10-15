// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Source side of a testnet cross-chain atomic-swap protocol.
/// @dev Settlement across two chains is NOT a single atomic transaction. The
///      secret must remain unpublished until the destination is confirmed.
contract HarborSourceEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { NONE, LOCKED, CLAIMED, REFUNDED }
    uint256 public constant SOURCE_DURATION = 24 hours;
    uint256 public constant FEE_BPS = 20;
    uint256 public constant BPS = 10_000;

    struct Quote {
        bytes32 intentId;
        bytes32 secretHash;
        address user;
        address solver;
        address destinationUser;
        address destinationSolver;
        address sourceEscrow;
        address sourceToken;
        address destinationEscrow;
        uint256 sourceAmount;
        uint256 destinationAmount;
        uint256 sourceChainId;
        uint256 destinationChainId;
        uint256 expiresAt;
        uint256 nonce;
    }

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 intentId,bytes32 secretHash,address user,address solver,address destinationUser,address destinationSolver,address sourceEscrow,address sourceToken,address destinationEscrow,uint256 sourceAmount,uint256 destinationAmount,uint256 sourceChainId,uint256 destinationChainId,uint256 expiresAt,uint256 nonce)"
    );

    struct Swap {
        address user;
        address solver;
        bytes32 secretHash;
        uint256 amount;
        uint64 openedAt;
        uint64 deadline;
        Status status;
    }

    IERC20 public immutable sourceToken;
    address public immutable destinationEscrow;
    address public immutable treasury;
    uint256 public immutable destinationChainId;
    mapping(bytes32 => Swap) public swaps;
    mapping(bytes32 => bytes32) public quoteDigests;

    event SourceLocked(bytes32 indexed intentId, address indexed user, address indexed solver, bytes32 secretHash, uint256 amount, uint64 deadline, bytes32 quoteDigest);
    event SourceClaimed(bytes32 indexed intentId, bytes32 secret, uint256 solverAmount, uint256 protocolFee);
    event SourceRefunded(bytes32 indexed intentId, address indexed user, uint256 amount);

    constructor(address token_, address destinationEscrow_, address treasury_, uint256 destinationChainId_)
        EIP712("HARBOR", "1")
    {
        require(token_ != address(0) && destinationEscrow_ != address(0) && treasury_ != address(0), "ZERO_ADDRESS");
        require(destinationChainId_ != block.chainid, "SAME_CHAIN");
        sourceToken = IERC20(token_);
        destinationEscrow = destinationEscrow_;
        treasury = treasury_;
        destinationChainId = destinationChainId_;
    }

    function quoteDigest(Quote calldata q) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                q.intentId, q.secretHash, q.user, q.solver, q.destinationUser,
                q.destinationSolver, q.sourceEscrow, q.sourceToken,
                q.destinationEscrow, q.sourceAmount, q.destinationAmount,
                q.sourceChainId, q.destinationChainId, q.expiresAt, q.nonce
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function openSwap(Quote calldata q, bytes calldata signature) external nonReentrant {
        require(msg.sender == q.user, "NOT_USER");
        require(q.user != address(0) && q.solver != address(0), "ZERO_ACTOR");
        require(q.destinationUser != address(0) && q.destinationSolver != address(0), "ZERO_DEST_ACTOR");
        require(q.secretHash != bytes32(0) && q.intentId != bytes32(0), "ZERO_ID");
        require(q.sourceAmount > 0 && q.destinationAmount > 0, "ZERO_AMOUNT");
        require(q.sourceAmount * FEE_BPS / BPS > 0, "FEE_TOO_SMALL");
        require(q.sourceAmount <= type(uint256).max / FEE_BPS, "AMOUNT_OVERFLOW");
        require(block.timestamp < q.expiresAt, "QUOTE_EXPIRED");
        require(q.sourceChainId == block.chainid && q.destinationChainId == destinationChainId, "WRONG_CHAIN");
        require(q.sourceEscrow == address(this) && q.sourceToken == address(sourceToken), "WRONG_SOURCE");
        require(q.destinationEscrow == destinationEscrow, "WRONG_DESTINATION");
        require(swaps[q.intentId].status == Status.NONE, "INTENT_USED");

        bytes32 digest = quoteDigest(q);
        require(ECDSA.recover(digest, signature) == q.solver, "INVALID_SIGNATURE");

        uint256 beforeBalance = sourceToken.balanceOf(address(this));
        sourceToken.safeTransferFrom(msg.sender, address(this), q.sourceAmount);
        require(sourceToken.balanceOf(address(this)) - beforeBalance == q.sourceAmount, "FEE_ON_TRANSFER");

        uint64 openedAt = uint64(block.timestamp);
        uint64 deadline = uint64(block.timestamp + SOURCE_DURATION);
        swaps[q.intentId] = Swap(q.user, q.solver, q.secretHash, q.sourceAmount, openedAt, deadline, Status.LOCKED);
        quoteDigests[q.intentId] = digest;
        emit SourceLocked(q.intentId, q.user, q.solver, q.secretHash, q.sourceAmount, deadline, digest);
    }

    /// @dev Permissionless execution is safe because beneficiaries are immutable.
    function claim(bytes32 intentId, bytes32 secret) external nonReentrant {
        Swap storage s = swaps[intentId];
        require(s.status == Status.LOCKED, "NOT_LOCKED");
        require(block.timestamp < s.deadline, "EXPIRED");
        require(keccak256(abi.encodePacked(secret)) == s.secretHash, "INVALID_SECRET");
        s.status = Status.CLAIMED;
        uint256 fee = s.amount * FEE_BPS / BPS;
        sourceToken.safeTransfer(s.solver, s.amount - fee);
        sourceToken.safeTransfer(treasury, fee);
        emit SourceClaimed(intentId, secret, s.amount - fee, fee);
    }

    function refund(bytes32 intentId) external nonReentrant {
        Swap storage s = swaps[intentId];
        require(s.status == Status.LOCKED, "NOT_LOCKED");
        require(block.timestamp >= s.deadline, "NOT_EXPIRED");
        s.status = Status.REFUNDED;
        sourceToken.safeTransfer(s.user, s.amount);
        emit SourceRefunded(intentId, s.user, s.amount);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}

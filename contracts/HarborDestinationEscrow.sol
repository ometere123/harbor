// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Escrows native Portaldot EVM-interface currency against a SHA3 hashlock.
/// @dev msg.value is an EVM JSON-RPC quantity; do not infer its precision from
///      the Substrate-side token metadata without a live conversion check.
contract HarborDestinationEscrow is ReentrancyGuard {
    enum Status { NONE, LOCKED, CLAIMED, REFUNDED }
    uint256 public constant DESTINATION_DURATION = 4 hours;
    uint256 public constant MIN_DURATION = 3 hours;

    struct Swap {
        address solver;
        address recipient;
        bytes32 secretHash;
        uint256 amount;
        uint64 deadline;
        Status status;
    }

    address public immutable solverAlpha;
    address public immutable solverBravo;
    constructor(address alpha, address bravo) {
        require(alpha != address(0) && bravo != address(0) && alpha != bravo, "INVALID_SOLVERS");
        solverAlpha = alpha;
        solverBravo = bravo;
    }
    mapping(bytes32 => Swap) public swaps;

    event DestinationLocked(bytes32 indexed intentId, address indexed solver, address indexed recipient, bytes32 secretHash, uint256 amount, uint64 deadline);
    event DestinationClaimed(bytes32 indexed intentId, bytes32 secret, address indexed recipient, uint256 amount);
    event DestinationRefunded(bytes32 indexed intentId, address indexed solver, uint256 amount);

    function fundSwap(bytes32 intentId, bytes32 secretHash, address recipient, uint64 deadline)
        external payable nonReentrant
    {
        require(msg.sender == solverAlpha || msg.sender == solverBravo, "NOT_SOLVER");
        require(intentId != bytes32(0) && secretHash != bytes32(0), "ZERO_ID");
        require(recipient != address(0), "ZERO_RECIPIENT");
        require(msg.value > 0, "ZERO_VALUE");
        require(swaps[intentId].status == Status.NONE, "INTENT_USED");
        require(deadline >= block.timestamp + MIN_DURATION, "TOO_SOON");
        require(deadline <= block.timestamp + DESTINATION_DURATION, "TOO_FAR");
        swaps[intentId] = Swap(msg.sender, recipient, secretHash, msg.value, deadline, Status.LOCKED);
        emit DestinationLocked(intentId, msg.sender, recipient, secretHash, msg.value, deadline);
    }

    function claim(bytes32 intentId, bytes32 secret) external nonReentrant {
        Swap storage s = swaps[intentId];
        require(s.status == Status.LOCKED, "NOT_LOCKED");
        require(block.timestamp < s.deadline, "EXPIRED");
        require(keccak256(abi.encodePacked(secret)) == s.secretHash, "INVALID_SECRET");
        s.status = Status.CLAIMED;
        (bool ok,) = payable(s.recipient).call{value: s.amount}("");
        require(ok, "NATIVE_SEND_FAILED");
        emit DestinationClaimed(intentId, secret, s.recipient, s.amount);
    }

    function refund(bytes32 intentId) external nonReentrant {
        Swap storage s = swaps[intentId];
        require(s.status == Status.LOCKED, "NOT_LOCKED");
        require(block.timestamp >= s.deadline, "NOT_EXPIRED");
        s.status = Status.REFUNDED;
        (bool ok,) = payable(s.solver).call{value: s.amount}("");
        require(ok, "NATIVE_SEND_FAILED");
        emit DestinationRefunded(intentId, s.solver, s.amount);
    }
}

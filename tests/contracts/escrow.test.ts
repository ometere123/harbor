import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const types = {
  Quote: [
    { name: "intentId", type: "bytes32" },
    { name: "secretHash", type: "bytes32" },
    { name: "user", type: "address" },
    { name: "solver", type: "address" },
    { name: "destinationUser", type: "address" },
    { name: "destinationSolver", type: "address" },
    { name: "sourceEscrow", type: "address" },
    { name: "sourceToken", type: "address" },
    { name: "destinationEscrow", type: "address" },
    { name: "sourceAmount", type: "uint256" },
    { name: "destinationAmount", type: "uint256" },
    { name: "sourceChainId", type: "uint256" },
    { name: "destinationChainId", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};
const destinationChainId = 420420777n;
const hundredUSD = 100n * 10n ** 6n;
const fortyTwoPOT = 42n * 10n ** 18n;

describe("HARBOR dual-chain escrow lifecycle", () => {
  async function setup() {
    const [user, solver, stranger, treasury] = await ethers.getSigners();
    const token = await ethers.deployContract("HarborTestUSD");
    await token.waitForDeployment();
    const destination = await ethers.deployContract("HarborDestinationEscrow",[solver.address,treasury.address]);
    await destination.waitForDeployment();
    const source = await ethers.deployContract("HarborSourceEscrow", [
      await token.getAddress(), await destination.getAddress(), treasury.address, destinationChainId
    ]);
    await source.waitForDeployment();
    await token.connect(user).faucet();
    await token.connect(user).approve(await source.getAddress(), hundredUSD);
    const secret = ethers.hexlify(ethers.randomBytes(32));
    const hash = ethers.keccak256(secret);
    const intentId = ethers.hexlify(ethers.randomBytes(32));
    const now = BigInt(await time.latest());
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const quote = {
      intentId, secretHash: hash, user: user.address, solver: solver.address,
      destinationUser: user.address, destinationSolver: solver.address,
      sourceEscrow: await source.getAddress(), sourceToken: await token.getAddress(),
      destinationEscrow: await destination.getAddress(), sourceAmount: hundredUSD,
      destinationAmount: fortyTwoPOT, sourceChainId: chainId, destinationChainId,
      expiresAt: now + 300n, nonce: 123456n,
    };
    const signature = await solver.signTypedData({
      name: "HARBOR", version: "1", chainId, verifyingContract: await source.getAddress()
    }, types, quote);
    return { user, solver, stranger, treasury, token, source, destination, quote, signature, secret, hash, intentId };
  }
  it("takes tokens, funds native escrow, pays user and settles solver net of fee", async () => {
    const s=await setup();
    await expect(s.source.connect(s.user).openSwap(s.quote,s.signature)).to.emit(s.source,"SourceLocked");
  });
  it("settles both sides with the same secret and immutable beneficiaries", async () => {
    const s=await setup();
    await s.source.connect(s.user).openSwap(s.quote,s.signature);
    const deadline=BigInt(await time.latest())+4n*3600n;
    await s.destination.connect(s.solver).fundSwap(s.intentId,s.hash,s.user.address,deadline,{value:fortyTwoPOT});
    const userBefore=await ethers.provider.getBalance(s.user.address);
    await s.destination.connect(s.stranger).claim(s.intentId,s.secret);
    const userAfter=await ethers.provider.getBalance(s.user.address);
    expect(userAfter-userBefore).to.equal(fortyTwoPOT);
    await s.source.connect(s.stranger).claim(s.intentId,s.secret);
    expect(await s.token.balanceOf(s.solver.address)).to.equal(hundredUSD-200_000n);
    expect(await s.token.balanceOf(s.treasury.address)).to.equal(200_000n);
    expect((await s.source.swaps(s.intentId)).status).to.equal(2);
    expect((await s.destination.swaps(s.intentId)).status).to.equal(2);
  });
  it("rejects forged quotes, wrong contract details, wrong caller and expired quotes", async () => {
    const s=await setup();
    await expect(s.source.connect(s.stranger).openSwap(s.quote,s.signature)).to.be.revertedWith("NOT_USER");
    await expect(s.source.connect(s.user).openSwap({...s.quote,sourceAmount:hundredUSD+1n},s.signature))
      .to.be.revertedWith("INVALID_SIGNATURE");
    await expect(s.source.connect(s.user).openSwap({...s.quote,destinationChainId:123n},s.signature))
      .to.be.revertedWith("WRONG_CHAIN");
    await time.increase(360);
    await expect(s.source.connect(s.user).openSwap(s.quote,s.signature)).to.be.revertedWith("QUOTE_EXPIRED");
  });
  it("enforces the five-minute quote window and binds the destination solver", async () => {
    const s=await setup();
    const longQuote={...s.quote,expiresAt:s.quote.expiresAt+301n};
    const longSignature=await s.solver.signTypedData({
      name:"HARBOR",version:"1",chainId:s.quote.sourceChainId,verifyingContract:await s.source.getAddress()
    },types,longQuote);
    await expect(s.source.connect(s.user).openSwap(longQuote,longSignature)).to.be.revertedWith("QUOTE_TOO_LONG");

    const mismatched={...s.quote,destinationSolver:s.stranger.address};
    const mismatchedSignature=await s.solver.signTypedData({
      name:"HARBOR",version:"1",chainId:s.quote.sourceChainId,verifyingContract:await s.source.getAddress()
    },types,mismatched);
    await expect(s.source.connect(s.user).openSwap(mismatched,mismatchedSignature)).to.be.revertedWith("SOLVER_MISMATCH");
  });
  it("rejects an amount whose 20 bps fee rounds to zero before taking tokens", async () => {
    const s=await setup();
    const tiny={...s.quote,sourceAmount:1n};
    const signature=await s.solver.signTypedData({
      name:"HARBOR",version:"1",chainId:s.quote.sourceChainId,verifyingContract:await s.source.getAddress()
    },types,tiny);
    await expect(s.source.connect(s.user).openSwap(tiny,signature)).to.be.revertedWith("FEE_TOO_SMALL");
  });
  it("does not allow malformed native funding or duplicate intent IDs", async () => {
    const s=await setup();
    await s.source.connect(s.user).openSwap(s.quote,s.signature);
    await expect(s.source.connect(s.user).openSwap(s.quote,s.signature)).to.be.revertedWith("INTENT_USED");
    const now=BigInt(await time.latest());
    await expect(s.destination.connect(s.solver).fundSwap(s.intentId,s.hash,s.user.address,now+100n,{value:fortyTwoPOT}))
      .to.be.revertedWith("TOO_SOON");
    await expect(s.destination.connect(s.solver).fundSwap(s.intentId,s.hash,s.user.address,now+4n*3600n-5n*60n,{value:fortyTwoPOT}))
      .to.be.revertedWith("TOO_SOON");
    await expect(s.destination.connect(s.solver).fundSwap(s.intentId,s.hash,s.user.address,now+5n*3600n,{value:fortyTwoPOT}))
      .to.be.revertedWith("TOO_FAR");
    const deadline=now+4n*3600n;
    await expect(s.destination.connect(s.stranger).fundSwap(s.intentId,s.hash,s.user.address,deadline,{value:fortyTwoPOT})).to.be.revertedWith("NOT_SOLVER");
    await s.destination.connect(s.solver).fundSwap(s.intentId,s.hash,s.user.address,deadline,{value:fortyTwoPOT});
    await expect(s.destination.connect(s.solver).fundSwap(s.intentId,s.hash,s.user.address,deadline,{value:fortyTwoPOT}))
      .to.be.revertedWith("INTENT_USED");
  });
  it("rejects wrong secrets, double claims and refunds before deadlines", async () => {
    const s=await setup();
    await s.source.connect(s.user).openSwap(s.quote,s.signature);
    await s.destination.connect(s.solver).fundSwap(s.intentId,s.hash,s.user.address,BigInt(await time.latest())+4n*3600n,{value:fortyTwoPOT});
    const wrong=ethers.hexlify(ethers.randomBytes(32));
    await expect(s.destination.connect(s.stranger).claim(s.intentId,wrong)).to.be.revertedWith("INVALID_SECRET");
    await expect(s.source.refund(s.intentId)).to.be.revertedWith("NOT_EXPIRED");
    await s.destination.connect(s.stranger).claim(s.intentId,s.secret);
    await expect(s.destination.connect(s.stranger).claim(s.intentId,s.secret)).to.be.revertedWith("NOT_LOCKED");
  });
  it("refunds unclaimed native escrow and source tokens after independent deadlines", async () => {
    const s=await setup();
    await s.source.connect(s.user).openSwap(s.quote,s.signature);
    const deadline=BigInt(await time.latest())+4n*3600n;
    await s.destination.connect(s.solver).fundSwap(s.intentId,s.hash,s.user.address,deadline,{value:fortyTwoPOT});
    await time.increaseTo(deadline);
    await s.destination.connect(s.stranger).refund(s.intentId);
    expect((await s.destination.swaps(s.intentId)).status).to.equal(3);
    expect(await ethers.provider.getBalance(await s.destination.getAddress())).to.equal(0);
    await time.increase(24*3600);
    await s.source.connect(s.stranger).refund(s.intentId);
    expect(await s.token.balanceOf(s.user.address)).to.equal(1000n*10n**6n);
    expect(await s.token.balanceOf(s.treasury.address)).to.equal(0);
    await expect(s.source.claim(s.intentId,s.secret)).to.be.revertedWith("NOT_LOCKED");
  });
  it("prevents claims after expiry and allows refund instead", async () => {
    const s=await setup();
    await s.source.connect(s.user).openSwap(s.quote,s.signature);
    const deadline=BigInt(await time.latest())+4n*3600n;
    await s.destination.connect(s.solver).fundSwap(s.intentId,s.hash,s.user.address,deadline,{value:fortyTwoPOT});
    await time.increaseTo(deadline);
    await expect(s.destination.claim(s.intentId,s.secret)).to.be.revertedWith("EXPIRED");
    await s.destination.refund(s.intentId);
    await time.increase(24*3600);
    await expect(s.source.claim(s.intentId,s.secret)).to.be.revertedWith("EXPIRED");
  });
  it("rolls back a failed native payout without changing status or trapping a second claim", async () => {
    const s=await setup();
    const badRecipient=await s.destination.getAddress();
    const intent=ethers.hexlify(ethers.randomBytes(32));
    const deadline=BigInt(await time.latest())+4n*3600n;
    await s.destination.connect(s.solver).fundSwap(intent,s.hash,badRecipient,deadline,{value:fortyTwoPOT});
    const before=await ethers.provider.getBalance(badRecipient);
    await expect(s.destination.connect(s.stranger).claim(intent,s.secret)).to.be.revertedWith("NATIVE_SEND_FAILED");
    expect((await s.destination.swaps(intent)).status).to.equal(1);
    expect(await ethers.provider.getBalance(badRecipient)).to.equal(before);
  });
  it("mints only one faucet claim per day per address", async () => {
    const s=await setup();
    await expect(s.token.connect(s.user).faucet()).to.be.revertedWith("FAUCET_COOLDOWN");
    await time.increase(24*3600);
    await s.token.connect(s.user).faucet();
    expect(await s.token.balanceOf(s.user.address)).to.equal(2000n*10n**6n);
  });
});

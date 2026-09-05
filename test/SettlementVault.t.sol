// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SettlementVault} from "../contracts/SettlementVault.sol";
import {SettlementVaultHarness} from "./harness/SettlementVaultHarness.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {
    INativeQueryVerifier
} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

/// @dev Local stand-in for Creditcoin precompile `0xFD2`. Always fails `verifyAndEmit`.
///      Used only to assert `execute` does not proceed without verification.
///      This is not Attestcoin verification and must not be treated as a successful proof.
contract RejectingQueryVerifierStub {
    function calculateTxIndex(INativeQueryVerifier.MerkleProof calldata) external pure returns (uint64) {
        return 0;
    }

    function verifyAndEmit(
        uint64,
        uint64,
        bytes calldata,
        INativeQueryVerifier.MerkleProof calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external pure returns (bool) {
        return false;
    }
}

/// @notice Local tests for vault settlement rules. Successful `ASCBase.execute` on CC3 is not covered here.
contract SettlementVaultTest is Test {
    SettlementVaultHarness internal vault;

    address internal constant SOURCE_REGISTRY = address(0x1111);
    address internal constant SPOOFED_REGISTRY = address(0xBAD);
    address payable internal constant OPERATOR = payable(address(0xABC));
    uint256 internal constant JOB_ID = 1001;
    uint256 internal constant REWARD = 5 ether;

    address internal constant VERIFIER_PRECOMPILE = 0x0000000000000000000000000000000000000FD2;

    event JobSettled(uint256 indexed jobId, address indexed operator, uint256 reward, bytes32 indexed queryId);

    function setUp() public {
        vm.etch(VERIFIER_PRECOMPILE, address(new RejectingQueryVerifierStub()).code);
        vault = new SettlementVaultHarness(SOURCE_REGISTRY);
        vm.deal(address(vault), 10 ether);
    }

    function test_decodeJobCompleted_readsJobIdOperatorReward() public view {
        (uint256 jobId, address operator, uint256 reward) =
            vault.exposeDecodeJobCompleted(_jobLog(SOURCE_REGISTRY, JOB_ID, OPERATOR, REWARD));

        assertEq(jobId, JOB_ID);
        assertEq(operator, OPERATOR);
        assertEq(reward, REWARD);
    }

    function test_settle_paysVerifiedOperatorVerifiedReward() public {
        uint256 operatorBefore = OPERATOR.balance;
        bytes32 queryId = bytes32(uint256(1));

        vm.expectEmit(true, true, true, true);
        emit JobSettled(JOB_ID, OPERATOR, REWARD, queryId);

        vault.exposeSettleFromEncodedTransaction(queryId, _encodedJobTx(SOURCE_REGISTRY, JOB_ID, OPERATOR, REWARD));

        assertTrue(vault.settledJobs(JOB_ID));
        assertEq(OPERATOR.balance, operatorBefore + REWARD);
        assertEq(address(vault).balance, 10 ether - REWARD);
    }

    function test_settle_ignoresCallerSuppliedPayout() public {
        // Caller cannot pass operator/reward; they are decoded from the proved JobCompleted log.
        vault.exposeSettleFromEncodedTransaction(
            bytes32(uint256(2)), _encodedJobTx(SOURCE_REGISTRY, JOB_ID, OPERATOR, REWARD)
        );
        assertEq(OPERATOR.balance, REWARD);
        assertTrue(vault.settledJobs(JOB_ID));
    }

    function test_settle_rejectsWrongEmitter() public {
        vm.expectRevert(SettlementVault.UnexpectedSourceRegistry.selector);
        vault.exposeSettleFromEncodedTransaction(
            bytes32(uint256(3)), _encodedJobTx(SPOOFED_REGISTRY, JOB_ID, OPERATOR, REWARD)
        );
    }

    function test_settle_rejectsMissingJobCompleted() public {
        vm.expectRevert(SettlementVault.JobCompletedEventNotFound.selector);
        vault.exposeSettleFromEncodedTransaction(bytes32(uint256(4)), _encodedFailedOrEmptyTx(true));
    }

    function test_settle_rejectsFailedSourceTx() public {
        vm.expectRevert(SettlementVault.TransactionDidNotSucceed.selector);
        vault.exposeSettleFromEncodedTransaction(bytes32(uint256(5)), _encodedFailedOrEmptyTx(false));
    }

    function test_settle_rejectsZeroOperator() public {
        vm.expectRevert(SettlementVault.InvalidOperator.selector);
        vault.exposeSettleFromEncodedTransaction(
            bytes32(uint256(6)), _encodedJobTx(SOURCE_REGISTRY, JOB_ID, address(0), REWARD)
        );
    }

    function test_settle_rejectsZeroReward() public {
        vm.expectRevert(SettlementVault.InvalidReward.selector);
        vault.exposeSettleFromEncodedTransaction(
            bytes32(uint256(7)), _encodedJobTx(SOURCE_REGISTRY, JOB_ID, OPERATOR, 0)
        );
    }

    function test_settle_rejectsReplayOfSameJob() public {
        vault.exposeSettleFromEncodedTransaction(
            bytes32(uint256(8)), _encodedJobTx(SOURCE_REGISTRY, JOB_ID, OPERATOR, REWARD)
        );

        vm.expectRevert(SettlementVault.JobAlreadySettled.selector);
        vault.exposeSettleFromEncodedTransaction(
            bytes32(uint256(9)), _encodedJobTx(SOURCE_REGISTRY, JOB_ID, OPERATOR, REWARD)
        );
    }

    function test_settle_rejectsInsufficientFunds() public {
        vm.deal(address(vault), REWARD - 1);

        vm.expectRevert(SettlementVault.InsufficientVaultFunds.selector);
        vault.exposeSettleFromEncodedTransaction(
            bytes32(uint256(10)), _encodedJobTx(SOURCE_REGISTRY, JOB_ID, OPERATOR, REWARD)
        );
        assertFalse(vault.settledJobs(JOB_ID));
    }

    function test_execute_rejectsWhenVerifierReturnsFalse() public {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings =
            new INativeQueryVerifier.MerkleProofEntry[](0);

        vm.expectRevert("Proof of inclusion verification failed");
        vault.execute(0, 1, 100, "", bytes32(uint256(43)), siblings, bytes32(0), new bytes32[](0));
    }

    function test_execute_rejectsProcessedQueryId() public {
        uint64 chainKey = 1;
        uint64 blockHeight = 100;
        bytes32 merkleRoot = bytes32(uint256(42));
        INativeQueryVerifier.MerkleProofEntry[] memory siblings =
            new INativeQueryVerifier.MerkleProofEntry[](0);

        bytes32 queryId = vault.exposeComputeQueryId(chainKey, blockHeight, merkleRoot, siblings);
        vault.exposeMarkQueryProcessed(queryId);

        vm.expectRevert("Query already processed");
        vault.execute(0, chainKey, blockHeight, "", merkleRoot, siblings, bytes32(0), new bytes32[](0));
    }

    function _jobLog(address emitter, uint256 jobId, address operator, uint256 reward)
        internal
        pure
        returns (EvmV1Decoder.LogEntry[] memory logs)
    {
        logs = new EvmV1Decoder.LogEntry[](1);
        logs[0].address_ = emitter;
        logs[0].topics = new bytes32[](3);
        logs[0].topics[0] = keccak256("JobCompleted(uint256,address,uint256)");
        logs[0].topics[1] = bytes32(jobId);
        logs[0].topics[2] = bytes32(uint256(uint160(operator)));
        logs[0].data = abi.encode(reward);
    }

    function _encodedJobTx(address emitter, uint256 jobId, address operator, uint256 reward)
        internal
        pure
        returns (bytes memory encoded)
    {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = keccak256("JobCompleted(uint256,address,uint256)");
        topics[1] = bytes32(jobId);
        topics[2] = bytes32(uint256(uint160(operator)));

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({address_: emitter, topics: topics, data: abi.encode(reward)});

        encoded = _encodeReceiptTx(1, logs);
    }

    function _encodedFailedOrEmptyTx(bool successNoLogs) internal pure returns (bytes memory encoded) {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](0);
        encoded = _encodeReceiptTx(successNoLogs ? uint8(1) : uint8(0), logs);
    }

    function _encodeReceiptTx(uint8 receiptStatus, EvmV1Decoder.LogEntryTuple[] memory logs)
        internal
        pure
        returns (bytes memory encoded)
    {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(0), uint64(21_000), address(0x1), false, address(0x2), uint256(0), bytes(""));
        chunks[1] = abi.encode(uint128(1), uint256(27), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(receiptStatus, uint64(21_000), logs, bytes(""));
        encoded = abi.encode(uint8(0), chunks);
    }
}

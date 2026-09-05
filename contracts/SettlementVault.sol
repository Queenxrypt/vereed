// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ASCBase} from "@gluwa/asc-contracts/contracts/readability/ASCBase.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

/// @title SettlementVault
/// @notice Creditcoin settlement ASC: pay an operator from a proved Sepolia `JobCompleted` event.
/// @dev Inherits official Attestcoin `ASCBase`. Proof verification is `ASCBase.execute` → native
///      query verifier precompile `0xFD2`. Do not treat local harness calls as Attestcoin verification.
contract SettlementVault is ASCBase {
    enum VaultActions {
        Settle // 0 — submitted as `execute` action, same pattern as ASCMinter.Mint
    }

    /// @dev keccak256("JobCompleted(uint256,address,uint256)")
    bytes32 public constant JOB_COMPLETED_SIGNATURE = keccak256("JobCompleted(uint256,address,uint256)");

    /// @notice Sepolia `MockDePINJobRegistry` whose `JobCompleted` logs this vault will settle.
    address public immutable sourceRegistry;

    /// @notice jobId → already paid. Bound to `sourceRegistry` (only that emitter is accepted).
    mapping(uint256 => bool) public settledJobs;

    event JobSettled(uint256 indexed jobId, address indexed operator, uint256 reward, bytes32 indexed queryId);
    event VaultFunded(address indexed from, uint256 amount);

    error InvalidAction(uint8 action);
    error InvalidSourceRegistry();
    error UnsupportedTransactionType();
    error TransactionDidNotSucceed();
    error JobCompletedEventNotFound();
    error UnexpectedSourceRegistry();
    error InvalidJobCompletedTopics();
    error InvalidJobCompletedData();
    error NotJobCompletedEvent();
    error InvalidOperator();
    error InvalidReward();
    error JobAlreadySettled();
    error InsufficientVaultFunds();
    error PaymentFailed();

    constructor(address sourceRegistry_) {
        if (sourceRegistry_ == address(0)) revert InvalidSourceRegistry();
        sourceRegistry = sourceRegistry_;
    }

    receive() external payable {
        emit VaultFunded(msg.sender, msg.value);
    }

    /// @inheritdoc ASCBase
    function _processAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction)
        internal
        override
    {
        if (action != uint8(VaultActions.Settle)) revert InvalidAction(action);
        _settleFromProvedTransaction(queryId, encodedTransaction);
    }

    /// @dev App logic after `ASCBase` has verified inclusion/continuity and marked `queryId` processed.
    function _settleFromProvedTransaction(bytes32 queryId, bytes memory encodedTransaction) internal {
        EvmV1Decoder.LogEntry[] memory jobLogs = _jobCompletedLogs(encodedTransaction);
        (uint256 jobId, address operator, uint256 reward) = _decodeJobCompleted(jobLogs);

        if (operator == address(0)) revert InvalidOperator();
        if (reward == 0) revert InvalidReward();
        if (settledJobs[jobId]) revert JobAlreadySettled();
        if (address(this).balance < reward) revert InsufficientVaultFunds();

        settledJobs[jobId] = true;

        (bool paid,) = operator.call{value: reward}("");
        if (!paid) revert PaymentFailed();

        emit JobSettled(jobId, operator, reward, queryId);
    }

    function _jobCompletedLogs(bytes memory encodedTransaction)
        internal
        pure
        returns (EvmV1Decoder.LogEntry[] memory jobLogs)
    {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        if (!EvmV1Decoder.isValidTransactionType(txType)) revert UnsupportedTransactionType();

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert TransactionDidNotSucceed();

        jobLogs = EvmV1Decoder.getLogsByEventSignature(receipt, JOB_COMPLETED_SIGNATURE);
        if (jobLogs.length == 0) revert JobCompletedEventNotFound();
    }

    /// @dev First `JobCompleted` log in the proved receipt. Emitter must be `sourceRegistry`.
    function _decodeJobCompleted(EvmV1Decoder.LogEntry[] memory jobLogs)
        internal
        view
        returns (uint256 jobId, address operator, uint256 reward)
    {
        if (jobLogs.length == 0) revert JobCompletedEventNotFound();
        EvmV1Decoder.LogEntry memory log = jobLogs[0];

        if (log.address_ != sourceRegistry) revert UnexpectedSourceRegistry();
        if (log.topics.length != 3) revert InvalidJobCompletedTopics();
        if (log.topics[0] != JOB_COMPLETED_SIGNATURE) revert NotJobCompletedEvent();
        if (log.data.length != 32) revert InvalidJobCompletedData();

        jobId = uint256(log.topics[1]);
        operator = address(uint160(uint256(log.topics[2])));
        reward = abi.decode(log.data, (uint256));
    }
}

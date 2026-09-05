// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SettlementVault} from "../../contracts/SettlementVault.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {
    INativeQueryVerifier
} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

/// @dev Exposes settlement decode/pay logic without calling the native query verifier.
///      Harness calls are not Attestcoin verification.
contract SettlementVaultHarness is SettlementVault {
    constructor(address sourceRegistry_) SettlementVault(sourceRegistry_) {}

    function exposeSettleFromEncodedTransaction(bytes32 queryId, bytes memory encodedTransaction) external {
        _settleFromProvedTransaction(queryId, encodedTransaction);
    }

    function exposeDecodeJobCompleted(EvmV1Decoder.LogEntry[] memory jobLogs)
        external
        view
        returns (uint256 jobId, address operator, uint256 reward)
    {
        return _decodeJobCompleted(jobLogs);
    }

    function exposeComputeQueryId(
        uint64 chainKey,
        uint64 blockHeight,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings
    ) external view returns (bytes32) {
        return _computeQueryId(chainKey, blockHeight, merkleRoot, siblings);
    }

    function exposeMarkQueryProcessed(bytes32 queryId) external {
        processedQueries[queryId] = true;
    }
}

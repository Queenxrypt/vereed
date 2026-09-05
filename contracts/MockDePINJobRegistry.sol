// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @title MockDePINJobRegistry
/// @notice Source-chain mock DePIN job registry for the Vereed hackathon demo.
/// @dev Deployable on Ethereum Sepolia. Records jobs and completed work onchain.
///      Reward is stored at job creation; `completeJob` does not accept a payout amount.
///      Attestcoin verification and SettlementVault live outside this contract.
contract MockDePINJobRegistry {
    struct Job {
        address operator;
        uint256 reward;
        bool completed;
    }

    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address indexed operator, uint256 reward);
    event JobCompleted(uint256 indexed jobId, address indexed operator, uint256 reward);

    error InvalidJobId();
    error InvalidOperator();
    error InvalidReward();
    error JobAlreadyExists();
    error JobDoesNotExist();
    error JobAlreadyCompleted();

    /// @notice Register a job with its operator and onchain reward.
    /// @dev `jobId` and `reward` are source-chain facts, not settlement inputs.
    function createJob(uint256 jobId, address operator, uint256 reward) external {
        if (jobId == 0) revert InvalidJobId();
        if (operator == address(0)) revert InvalidOperator();
        if (reward == 0) revert InvalidReward();
        if (jobs[jobId].operator != address(0)) revert JobAlreadyExists();

        jobs[jobId] = Job({operator: operator, reward: reward, completed: false});
        emit JobCreated(jobId, operator, reward);
    }

    /// @notice Mark a job complete and emit the attested work event for later settlement.
    /// @dev Operator and reward are read from storage, not from the caller.
    function completeJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.operator == address(0)) revert JobDoesNotExist();
        if (job.completed) revert JobAlreadyCompleted();

        job.completed = true;
        emit JobCompleted(jobId, job.operator, job.reward);
    }
}

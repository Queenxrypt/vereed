// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockDePINJobRegistry} from "../contracts/MockDePINJobRegistry.sol";

contract MockDePINJobRegistryTest is Test {
    MockDePINJobRegistry internal registry;

    event JobCompleted(uint256 indexed jobId, address indexed operator, uint256 reward);

    address internal constant OPERATOR = address(0xABC);
    uint256 internal constant JOB_ID = 1001;
    uint256 internal constant REWARD = 5 ether;

    function setUp() public {
        registry = new MockDePINJobRegistry();
    }

    function test_createJob() public {
        registry.createJob(JOB_ID, OPERATOR, REWARD);

        (address operator, uint256 reward, bool completed) = registry.jobs(JOB_ID);
        assertEq(operator, OPERATOR);
        assertEq(reward, REWARD);
        assertFalse(completed);
    }

    function test_completeJob() public {
        registry.createJob(JOB_ID, OPERATOR, REWARD);

        registry.completeJob(JOB_ID);

        (,, bool completed) = registry.jobs(JOB_ID);
        assertTrue(completed);
    }

    function test_completeJob_emitsJobCompleted() public {
        registry.createJob(JOB_ID, OPERATOR, REWARD);

        vm.expectEmit(true, true, false, true);
        emit JobCompleted(JOB_ID, OPERATOR, REWARD);
        registry.completeJob(JOB_ID);
    }

    function test_completeJob_cannotCompleteTwice() public {
        registry.createJob(JOB_ID, OPERATOR, REWARD);
        registry.completeJob(JOB_ID);

        vm.expectRevert(MockDePINJobRegistry.JobAlreadyCompleted.selector);
        registry.completeJob(JOB_ID);
    }
}

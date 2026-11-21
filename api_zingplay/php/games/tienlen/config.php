<?php
declare(strict_types=1);

return [
    'turnSeconds' => 20,
    'summarySeconds' => 3,
    'dealingSeconds' => 1,
    'autoStartSeconds' => 3,
    'timeoutLimit' => 3,
    'winnerStarts' => true,
    'rankMode' => 'full',
    'rankPoints' => [2 => [1, -1], 3 => [2, 0, -2], 4 => [2, 1, -1, -2]],
    'firstOnlyPoints' => 1,
    'whiteEnabled' => true,
    'whitePriority' => ['dragon', 'four_twos', 'six_pairs', 'five_pairs_run', 'four_threes'],
    'whitePayment' => 3,
    'chopRules' => [
        'pairs_run_3' => ['single_two'],
        'four' => ['single_two', 'pair_twos', 'pairs_run_3'],
        'pairs_run_4' => ['single_two', 'pair_twos', 'four', 'pairs_run_3'],
    ],
    'chopValues' => ['black_two' => 1, 'red_two' => 2, 'four' => 4, 'pairs_run_3' => 3, 'pairs_run_4' => 4],
    'coldMultiplier' => 2,
    'rottenTwosEnabled' => true,
];

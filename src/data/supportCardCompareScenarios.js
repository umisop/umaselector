/**
 * Scenario definitions for the support-card comparison tool.
 * Grand Masters remains the default to preserve the current site workflow.
 * Grand Concert is included as a second selectable scenario, matching the
 * scenario selector in the UmaGuide comparison tool.
 * Base rows: [Speed, Stamina, Power, Guts, Wit, Skill Points, Energy].
 * Grand Masters: https://gametora.vercel.app/umamusume/grand-masters
 * Grand Concert: https://uma.guide/guides/grand-concert
 */
export const SUPPORT_CARD_COMPARE_SCENARIOS = {
  activeScenarioId: 'grand-masters',
  scenarios: [
    {
      id: 'grand-masters',
      label: 'Grand Masters',
      enabled: true,
      source: 'https://gametora.vercel.app/umamusume/grand-masters',
      baseTables: {
        Speed: [[10,0,3,0,0,5,-19],[11,0,3,0,0,5,-20],[12,0,3,0,0,5,-21],[13,0,4,0,0,5,-23],[14,0,5,0,0,5,-25]],
        Stamina: [[0,8,0,6,0,5,-20],[0,9,0,6,0,5,-21],[0,10,0,6,0,5,-22],[0,11,0,7,0,5,-24],[0,12,0,8,0,5,-26]],
        Power: [[0,4,9,0,0,5,-20],[0,4,10,0,0,5,-21],[0,4,11,0,0,5,-22],[0,5,12,0,0,5,-24],[0,6,13,0,0,5,-26]],
        Guts: [[2,0,3,9,0,5,-20],[2,0,3,10,0,5,-21],[2,0,3,11,0,5,-22],[3,0,3,12,0,5,-24],[3,0,4,13,0,5,-26]],
        Wit: [[2,0,0,0,8,5,5],[2,0,0,0,9,5,5],[2,0,0,0,10,5,5],[3,0,0,0,11,5,5],[4,0,0,0,12,5,5]],
      },
    },
    {
      id: 'grand-concert',
      label: 'Grand Concert',
      enabled: true,
      source: 'https://uma.guide/guides/grand-concert',
      baseTables: {
        Speed: [[8,0,4,0,0,4,-19],[9,0,4,0,0,4,-20],[10,0,4,0,0,4,-21],[11,0,5,0,0,4,-23],[12,0,6,0,0,4,-25]],
        Stamina: [[0,8,0,6,0,4,-20],[0,9,0,6,0,4,-21],[0,10,0,6,0,4,-22],[0,11,0,7,0,4,-24],[0,12,0,8,0,4,-26]],
        Power: [[0,4,9,0,0,4,-20],[0,4,10,0,0,4,-21],[0,4,11,0,0,4,-22],[0,5,12,0,0,4,-24],[0,6,13,0,0,4,-26]],
        Guts: [[2,0,2,7,0,4,-20],[2,0,2,8,0,4,-21],[2,0,2,9,0,4,-22],[3,0,2,10,0,4,-24],[3,0,3,11,0,4,-26]],
        Wit: [[2,0,0,0,6,5,5],[2,0,0,0,7,5,5],[2,0,0,0,8,5,5],[3,0,0,0,9,5,5],[4,0,0,0,10,5,5]],
      },
    },
  ],
};

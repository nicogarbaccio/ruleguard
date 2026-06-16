/**
 * Standard Templates
 *
 * Pre-built, keyword-driven templates used by the local (offline) processor to
 * check that documentation covers the topics a given standard requires. These
 * intentionally use plain keyword lists so matching is fully deterministic and
 * needs no AI.
 */

export const STANDARD_TEMPLATES = {
  'GLI-19': {
    name: 'GLI-19: Interactive Gaming Systems v3.0',
    requiredTopics: [
      {
        category: 'RTP Disclosure',
        label: 'Return to Player (RTP) disclosure',
        keywords: ['rtp', 'return to player', 'payout percentage', 'theoretical return'],
        severity: 'critical',
        reference: 'GLI-19 Section 4.7',
        recommendation: 'State the theoretical RTP percentage clearly.'
      },
      {
        category: 'Interrupted Games',
        label: 'Interrupted game / disconnection policy',
        keywords: ['disconnect', 'interrupted game', 'connection lost', 'session timeout', 'resume'],
        severity: 'critical',
        reference: 'GLI-19 Section 4.16',
        recommendation: 'Document how interrupted or disconnected games are handled.'
      },
      {
        category: 'Game Rules Completeness',
        label: 'Rules of play',
        keywords: ['rules of play', 'how to play', 'game rules', 'gameplay'],
        severity: 'warning',
        reference: 'GLI-19 Section 4.4',
        recommendation: 'Include a complete rules-of-play section.'
      },
      {
        category: 'Bet Ranges',
        label: 'Bet range information',
        keywords: ['minimum bet', 'maximum bet', 'bet range', 'stake range', 'min bet', 'max bet'],
        severity: 'warning',
        reference: 'GLI-19 Section 4.2',
        recommendation: 'Document minimum and maximum bet amounts.'
      },
      {
        category: 'Responsible Gaming',
        label: 'Responsible gaming references',
        keywords: ['responsible gaming', 'responsible gambling', 'self-exclusion', 'reality check', 'gambling help'],
        severity: 'info',
        reference: 'GLI-19 (Responsible Gaming)',
        recommendation: 'Add responsible gaming information and links.'
      }
    ]
  },

  'GLI-11': {
    name: 'GLI-11: Gaming Devices',
    requiredTopics: [
      {
        category: 'RTP Disclosure',
        label: 'Theoretical payout percentage',
        keywords: ['rtp', 'return to player', 'payout percentage', 'theoretical payout'],
        severity: 'critical',
        reference: 'GLI-11 Section 2.0',
        recommendation: 'State the theoretical payout percentage.'
      },
      {
        category: 'Malfunction Clause',
        label: 'Malfunction voids policy',
        keywords: ['malfunction', 'voids all', 'void all pays', 'error voids'],
        severity: 'critical',
        reference: 'GLI-11 Section 3.0',
        recommendation: 'Include a "malfunction voids all pays and plays" style clause.'
      },
      {
        category: 'Maximum Win',
        label: 'Maximum win / top award',
        keywords: ['maximum win', 'max win', 'top award', 'highest pay', 'maximum payout'],
        severity: 'warning',
        reference: 'GLI-11 Section 2.0',
        recommendation: 'State the maximum possible win.'
      },
      {
        category: 'Game Rules Completeness',
        label: 'Rules of play',
        keywords: ['rules of play', 'how to play', 'game rules', 'paytable'],
        severity: 'warning',
        reference: 'GLI-11 Section 3.0',
        recommendation: 'Include complete game rules and paytable.'
      }
    ]
  }
};

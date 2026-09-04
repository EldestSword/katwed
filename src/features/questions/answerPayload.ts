import type { PlayerAnswerCore } from '../../types/domain'

/** Core payload shapes remain exact after optional submission metadata is extracted. */
export const ANSWER_CORE_FIELDS: Record<PlayerAnswerCore['type'], readonly string[]> = {
  'single-choice': ['type', 'optionId'],
  'multiple-select': ['type', 'optionIds'],
  'true-false': ['type', 'value'],
  slider: ['type', 'value'],
  pinpoint: ['type', 'x', 'y'],
  'typed-answer': ['type', 'value'],
  mashup: ['type', 'memberIds'],
  ordering: ['type', 'itemIds'],
  matching: ['type', 'pairs'],
  connections: ['type', 'value'],
}

import { readFile } from 'node:fs/promises'

// Default to the current audited revision; a positional path permits deliberate
// validation of an incoming revision or the immutable historical audit copy.
const path = process.argv[2] ?? new URL('../docs/data/tiebreaker-bank-v1.3.json', import.meta.url)
const bank = JSON.parse(await readFile(path, 'utf8'))
const questions = bank.questions
const expectedIds = Array.from({ length: 200 }, (_, index) => `TB${String(index + 1).padStart(3, '0')}`)

if (bank.questionCount !== 200 || !Array.isArray(questions) || questions.length !== 200) throw new Error('Tie-breaker bank must declare and contain exactly 200 questions.')
if (new Set(questions.map(({ id }) => id)).size !== 200 || expectedIds.some((id) => !questions.some((question) => question.id === id))) throw new Error('Tie-breaker bank must contain unique IDs TB001–TB200.')
if (new Set(questions.map(({ question }) => question.trim())).size !== 200) throw new Error('Tie-breaker prompts must be unique.')
for (const item of questions) {
  if (typeof item.answer !== 'number' || !Number.isFinite(item.answer)) throw new Error(`${item.id} has a non-numeric answer.`)
  for (const field of ['category', 'question', 'unit', 'sourceTitle', 'sourceUrl']) {
    if (typeof item[field] !== 'string' || !item[field].trim()) throw new Error(`${item.id} is missing ${field}.`)
  }
  if (new URL(item.sourceUrl).protocol !== 'https:') throw new Error(`${item.id} does not use an HTTPS source URL.`)
}

console.log(`Validated ${bank.bankName}: ${questions.length} questions, unique TB001–TB200 IDs, unique prompts, numeric answers, units and HTTPS source metadata.`)

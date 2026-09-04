import { readFile } from 'node:fs/promises'

const path = new URL('../docs/data/tiebreaker-bank-v1.json', import.meta.url)
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
  if (!item.sourceUrl.startsWith('https://')) throw new Error(`${item.id} does not use an HTTPS source URL.`)
}

console.log(`Validated ${questions.length} researched tie-breaker questions: unique TB001–TB200 IDs, unique prompts, numeric answers, units and source metadata.`)

import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

vi.mock('../components/AppShell', () => ({ Logo: () => <span>Katwed!</span> }))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}
function setup() {
  render(<MemoryRouter><LandingPage /><LocationProbe /></MemoryRouter>)
  return screen.getByRole('textbox', { name: 'Room code' })
}

describe('premium Katwed homepage', () => {
  it('introduces the whole platform rather than universal mash-up rules', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bring your')
    expect(within(screen.getByRole('list', { name: 'Question formats' })).getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByRole('heading', { name: 'Better together.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Stay in the game.' })).toBeInTheDocument()
    expect(screen.queryByText(/Exactly two\. Both correct/)).not.toBeInTheDocument()
  })

  it('rejects empty and incomplete codes, focusing the existing room input', () => {
    const input = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Join game' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the six-digit room code.')
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: '12345' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Join game' }))
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })

  it('normalises digits and preserves the established join route and leading zeroes', () => {
    const input = setup()
    fireEvent.change(input, { target: { value: '00a 12-34' } })
    expect(input).toHaveValue('001234')
    fireEvent.submit(screen.getByRole('form', { name: 'Join a game' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/join?room=001234')
  })

  it('accepts a spaced pasted code without the native maxlength cutting off a digit', () => {
    const input = setup()
    fireEvent.paste(input, { clipboardData: { getData: () => '123 456' } })
    expect(input).toHaveValue('123456')
  })

  it('makes the example playable locally without changing the room-code draft', () => {
    const input = setup()
    fireEvent.change(input, { target: { value: '654321' } })
    expect(screen.queryByText('Earth', { exact: true })).not.toBeInTheDocument()
    expect(screen.getByText('750', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reveal next clue' }))
    expect(screen.getByText('Earth', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Mars', { exact: true })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reveal next clue' }))
    expect(screen.getByText('Mars', { exact: true })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show connection' }))
    expect(screen.getByText('Planets', { exact: true })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByText('Earth', { exact: true })).not.toBeInTheDocument()
    expect(input).toHaveValue('654321')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })

  it('keeps hosting behind the existing host route', () => {
    setup()
    const hosts = screen.getAllByRole('link', { name: /Host a game/ })
    expect(hosts.length).toBeGreaterThan(0)
    for (const link of hosts) expect(link).toHaveAttribute('href', '/host')
  })
})

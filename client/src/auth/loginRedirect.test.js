import { expect, test } from 'vitest'
import { afterLoginPath } from './loginRedirect.js'

const parent = { role: 'parent' }
const withFrom = (from) => ({ state: { from } })

test('goes to the page the user was sent away from, with its query and hash', () => {
  const location = withFrom({ pathname: '/parent/tasks', search: '?week=2', hash: '#top' })
  expect(afterLoginPath(parent, location)).toBe('/parent/tasks?week=2#top')
})

test('goes to the home page of the role when there is no previous page', () => {
  expect(afterLoginPath(parent, { state: null })).toBe('/parent')
  expect(afterLoginPath({ role: 'child' }, undefined)).toBe('/child')
})

test.each([
  ['the login page itself', { pathname: '/login' }],
  ['an address that points to another site', { pathname: '//evil.example.com' }],
  ['a path that does not start with a slash', { pathname: 'evil.example.com' }],
  ['something that is not a path', { pathname: { x: 1 } }],
])('ignores %s and uses the role home page', (_name, from) => {
  expect(afterLoginPath(parent, withFrom(from))).toBe('/parent')
})

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
  ['/parent/children/12/tasks'],
  ['/specialist/children/3/tasks'],
  ['/child/tasks'],
  ['/parent/children/12/files/report%20v2.pdf'],
  ['/'],
])('keeps the safe path %s', (pathname) => {
  expect(afterLoginPath(parent, withFrom({ pathname }))).toBe(pathname)
})

test.each([
  ['the login page itself', { pathname: '/login' }],
  ['an address that points to another site', { pathname: '//evil.example.com' }],
  ['a path that does not start with a slash', { pathname: 'evil.example.com' }],
  ['something that is not a path', { pathname: { x: 1 } }],
  // Tarayıcılar "\" karakterini "/" gibi okur, yani "/\evil.example.com" aslında "//evil.example.com"
  ['a path with a backslash after the slash', { pathname: '/\\evil.example.com' }],
  ['a path with a backslash between two slashes', { pathname: '/\\/evil.example.com' }],
  ['a path with two backslashes', { pathname: '/\\\\evil.example.com' }],
  ['a path with a backslash in the middle', { pathname: '/parent\\evil' }],
  // Tarayıcılar URL'deki tab ve satır sonlarını siler, yani "/<tab>/evil.example.com" da "//evil.example.com"
  ['a path with a tab', { pathname: '/\t/evil.example.com' }],
  ['a path with a line break', { pathname: '/\n/evil.example.com' }],
  ['a path with a carriage return', { pathname: '/\r/evil.example.com' }],
  ['a path with a space', { pathname: '/parent tasks' }],
  ['a path with a letter outside the allowed characters', { pathname: '/ğ' }],
  ['an empty path', { pathname: '' }],
])('ignores %s and uses the role home page', (_name, from) => {
  expect(afterLoginPath(parent, withFrom(from))).toBe('/parent')
})

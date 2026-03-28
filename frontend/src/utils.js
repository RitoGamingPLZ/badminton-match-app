/** Generate a consistent colour for a player avatar from their name. */
const PALETTE = [
  '#16a34a','#2563eb','#9333ea','#d97706',
  '#dc2626','#0891b2','#65a30d','#c026d3',
]

export function avatarColor(name) {
  let hash = 0
  for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

import { useId, type SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }
const base = (size = 18): SVGProps<SVGSVGElement> => ({ width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true })
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const IcBack = ({ size, ...p }: P) => <svg {...base(size)} {...stroke} {...p}><path d="M15 5l-7 7 7 7" /></svg>
export const IcPlus = ({ size, ...p }: P) => <svg {...base(size)} {...stroke} strokeWidth={2.2} {...p}><path d="M12 5v14M5 12h14" /></svg>
export const IcClose = ({ size, ...p }: P) => <svg {...base(size)} {...stroke} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
export const IcBell = ({ size, ...p }: P) => <svg {...base(size)} {...stroke} {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
export const IcReceipt = ({ size, ...p }: P) => <svg {...base(size)} {...stroke} {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>
export const IcUpload = ({ size, ...p }: P) => <svg {...base(size)} {...stroke} {...p}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
export const IcEdit = ({ size, ...p }: P) => <svg {...base(size)} {...stroke} {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
export const IcTrash = ({ size, ...p }: P) => <svg {...base(size)} {...stroke} {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
export const IcWa = ({ size, ...p }: P) => (
  <svg {...base(size)} fill="currentColor" {...p}>
    <path d="M12 2.2a9.7 9.7 0 0 0-8.4 14.6L2.3 21.7l5-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 5 5 0 0 0 1 2.6 11.3 11.3 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.5-.2z" />
  </svg>
)

export function Logo({ size = 30 }: { size?: number }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF7A3D" /><stop offset="1" stopColor="#F2386F" /></linearGradient>
        <mask id={`m${id}`}><rect x="4" y="4" width="112" height="112" rx="32" fill="#fff" /><circle cx="4" cy="60" r="11" fill="#000" /><circle cx="116" cy="60" r="11" fill="#000" /></mask>
      </defs>
      <rect x="4" y="4" width="112" height="112" rx="32" fill={`url(#g${id})`} mask={`url(#m${id})`} />
      <rect x="34" y="30" width="11" height="60" rx="5.5" fill="#fff" />
      <rect x="34" y="30" width="52" height="11" rx="5.5" fill="#fff" />
      <rect x="34" y="54.5" width="48" height="11" rx="5.5" fill="#fff" fillOpacity=".35" />
      <rect x="34" y="54.5" width="32" height="11" rx="5.5" fill="#FFD166" />
      <rect x="34" y="79" width="52" height="11" rx="5.5" fill="#fff" />
    </svg>
  )
}

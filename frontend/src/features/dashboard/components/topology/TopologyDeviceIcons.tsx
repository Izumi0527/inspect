import React from 'react'

type DeviceSvgProps = React.SVGProps<SVGSVGElement>

/** 核心交换机：机箱底座 + 四向高速骨干交换核心矩阵 */
export const CoreSwitchIcon: React.FC<DeviceSvgProps> = ({ strokeWidth = 2, ...props }) => (
  <svg
    viewBox="0 0 36 36"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="4" y="4" width="28" height="28" rx="5" fill="currentColor" fillOpacity="0.06" />
    <rect x="12" y="12" width="12" height="12" rx="2.5" fill="currentColor" fillOpacity="0.14" />
    <circle cx="18" cy="18" r="2" fill="currentColor" stroke="none" />
    <path d="M18 7v5M16 9l2-2 2 2" />
    <path d="M18 29v-5M16 27l2 2 2-2" />
    <path d="M7 18h5M9 16l-2 2 2 2" />
    <path d="M29 18h-5M27 16l2 2-2 2" />
  </svg>
)

/** 汇聚交换机：上行收敛 + 叠层机身 + 下行三路分布分支 */
export const AggregationSwitchIcon: React.FC<DeviceSvgProps> = ({ strokeWidth = 1.75, ...props }) => (
  <svg
    viewBox="0 0 36 36"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M18 4v6M15.5 6.5L18 4l2.5 2.5" />
    <rect x="6" y="10.5" width="24" height="6.5" rx="2" fill="currentColor" fillOpacity="0.1" />
    <rect x="6" y="19" width="24" height="6.5" rx="2" fill="currentColor" fillOpacity="0.06" />
    <circle cx="10.5" cy="13.75" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="13.75" r="1" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="22.25" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="22.25" r="1" fill="currentColor" stroke="none" />
    <path d="M18 25.5v3.5M10 29h16M10 29v3M18 29v3M26 29v3" />
  </svg>
)

/** 接入交换机：1U 多口交换机面板 + 6 格清晰网口阵列 + 双向转发符号 */
export const AccessSwitchIcon: React.FC<DeviceSvgProps> = ({ strokeWidth = 1.5, ...props }) => (
  <svg
    viewBox="0 0 36 36"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M11 7h14M22.5 4.8L25 7l-2.5 2.2" />
    <path d="M25 11.5H11M13.5 9.3L11 11.5l2.5 2.2" />
    <rect x="4" y="16" width="28" height="12" rx="2.5" fill="currentColor" fillOpacity="0.08" />
    <rect x="7" y="19.5" width="2.8" height="4.5" rx="0.6" />
    <rect x="11.2" y="19.5" width="2.8" height="4.5" rx="0.6" />
    <rect x="15.4" y="19.5" width="2.8" height="4.5" rx="0.6" />
    <rect x="19.6" y="19.5" width="2.8" height="4.5" rx="0.6" />
    <rect x="23.8" y="19.5" width="2.8" height="4.5" rx="0.6" />
    <rect x="28" y="19.5" width="2.2" height="4.5" rx="0.6" />
  </svg>
)

/** 路由器：经典圆盘四向交叉箭头 */
export const RouterDeviceIcon: React.FC<DeviceSvgProps> = ({ strokeWidth = 1.75, ...props }) => (
  <svg
    viewBox="0 0 36 36"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="18" cy="18" r="13" fill="currentColor" fillOpacity="0.08" />
    <path d="M18 9v6M16 13l2 2 2-2" />
    <path d="M18 27v-6M16 23l2-2 2 2" />
    <path d="M9 18h6M11 16l-2 2 2 2" />
    <path d="M27 18h-6M25 16l2 2-2 2" />
  </svg>
)

/** 防火墙：带城墙纹理的防护盾牌 */
export const FirewallDeviceIcon: React.FC<DeviceSvgProps> = ({ strokeWidth = 1.75, ...props }) => (
  <svg
    viewBox="0 0 36 36"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path
      d="M18 4.5L7.5 8.8v7.8c0 6.8 4.5 12.6 10.5 14.9 6-2.3 10.5-8.1 10.5-14.9V8.8L18 4.5z"
      fill="currentColor"
      fillOpacity="0.08"
    />
    <path d="M10.5 15h15M11.5 20.5h13M18 10v5M14.5 15v5.5M21.5 15v5.5M18 20.5v5.5" />
  </svg>
)

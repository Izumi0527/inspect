'use client'

import React from 'react'
import {
  CompactPageToolbar,
  type CompactPageToolbarAction,
  type CompactPageToolbarProps,
} from '@/components/shared'

export type ReportsToolbarAction = CompactPageToolbarAction

type ReportsToolbarProps = Omit<CompactPageToolbarProps, 'testIdPrefix'>

export const ReportsToolbar: React.FC<ReportsToolbarProps> = (props) => (
  <CompactPageToolbar {...props} testIdPrefix="reports-toolbar" />
)

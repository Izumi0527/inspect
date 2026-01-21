import React from 'react'
import { render, screen } from '@testing-library/react'
import { AnimatedContainer, AnimatedList, PageTransition } from '../src/components/animation/AnimationSystem'

// Mock framer-motion for testing
jest.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (target, prop) => {
      return ({ children, ...props }: any) => {
        const Component = prop as keyof JSX.IntrinsicElements;
        return React.createElement(Component, props, children);
      };
    }
  }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useReducedMotion: jest.fn(() => false),
}))

describe('AnimationSystem', () => {
  describe('AnimatedContainer', () => {
    test('renders children correctly', () => {
      render(
        <AnimatedContainer>
          <div data-testid="child">Test Child</div>
        </AnimatedContainer>
      )
      
      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    test('applies custom className', () => {
      render(
        <AnimatedContainer className="custom-class">
          <div>Content</div>
        </AnimatedContainer>
      )
      
      const container = screen.getByText('Content').parentElement
      expect(container).toHaveClass('custom-class')
    })

    test('renders with different HTML elements when as prop is provided', () => {
      const { rerender } = render(
        <AnimatedContainer as="span">
          <div data-testid="content">Span Content</div>
        </AnimatedContainer>
      )
      
      expect(screen.getByTestId('content').parentElement?.tagName).toBe('SPAN')

      rerender(
        <AnimatedContainer as="section">
          <div data-testid="content">Section Content</div>
        </AnimatedContainer>
      )
      
      expect(screen.getByTestId('content').parentElement?.tagName).toBe('SECTION')
    })

    test('handles reduced motion preference', () => {
      const { useReducedMotion } = require('framer-motion')
      useReducedMotion.mockReturnValue(true)

      render(
        <AnimatedContainer>
          <div data-testid="reduced-motion">Content</div>
        </AnimatedContainer>
      )
      
      expect(screen.getByTestId('reduced-motion')).toBeInTheDocument()
      
      // Reset mock
      useReducedMotion.mockReturnValue(false)
    })
  })

  describe('AnimatedList', () => {
    test('renders all children', () => {
      const children = [
        <div key="1" data-testid="item-1">Item 1</div>,
        <div key="2" data-testid="item-2">Item 2</div>,
        <div key="3" data-testid="item-3">Item 3</div>,
      ]

      render(<AnimatedList>{children}</AnimatedList>)
      
      expect(screen.getByTestId('item-1')).toBeInTheDocument()
      expect(screen.getByTestId('item-2')).toBeInTheDocument()
      expect(screen.getByTestId('item-3')).toBeInTheDocument()
    })

    test('applies custom className to container', () => {
      const children = [<div key="1">Item</div>]
      
      render(
        <AnimatedList className="list-container">
          {children}
        </AnimatedList>
      )
      
      const container = screen.getByText('Item').parentElement?.parentElement
      expect(container).toHaveClass('list-container')
    })

    test('handles reduced motion preference', () => {
      const { useReducedMotion } = require('framer-motion')
      useReducedMotion.mockReturnValue(true)

      const children = [
        <div key="1" data-testid="item">Item</div>
      ]

      render(<AnimatedList>{children}</AnimatedList>)
      
      expect(screen.getByTestId('item')).toBeInTheDocument()
      
      // Reset mock
      useReducedMotion.mockReturnValue(false)
    })
  })

  describe('PageTransition', () => {
    test('renders children correctly', () => {
      render(
        <PageTransition>
          <div data-testid="page-content">Page Content</div>
        </PageTransition>
      )
      
      expect(screen.getByTestId('page-content')).toBeInTheDocument()
    })

    test('handles reduced motion by rendering children without animation wrapper', () => {
      const { useReducedMotion } = require('framer-motion')
      useReducedMotion.mockReturnValue(true)

      render(
        <PageTransition>
          <div data-testid="page-content">Page Content</div>
        </PageTransition>
      )
      
      expect(screen.getByTestId('page-content')).toBeInTheDocument()
      
      // Reset mock
      useReducedMotion.mockReturnValue(false)
    })
  })

  describe('Animation presets', () => {
    test('pageTransition has correct animation properties', () => {
      const { animations } = require('../src/components/animation/AnimationSystem')

      expect(animations.pageTransition).toMatchObject({
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -20 },
        transition: { duration: 0.3, ease: 'easeInOut' }
      })
    })

    test('cardHover has correct animation properties', () => {
      const { animations } = require('../src/components/animation/AnimationSystem')

      expect(animations.cardHover).toMatchObject({
        whileHover: {
          scale: 1.02,
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
          transition: { duration: 0.2 }
        },
        whileTap: { scale: 0.98 }
      })
    })

    test('fadeIn has correct animation properties', () => {
      const { animations } = require('../src/components/animation/AnimationSystem')

      expect(animations.fadeIn).toMatchObject({
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.3 }
      })
    })
  })
})
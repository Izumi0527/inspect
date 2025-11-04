import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationProvider, useNotifications } from '../src/components/feedback/FeedbackSystem'

// Test component to test notification hooks
const TestComponent = () => {
  const { success, error, warning, info, loading, clearAll } = useNotifications()

  return (
    <div>
      <button onClick={() => success('Success!', 'Operation completed')}>
        Show Success
      </button>
      <button onClick={() => error('Error!', 'Something went wrong')}>
        Show Error
      </button>
      <button onClick={() => warning('Warning!', 'Please be careful')}>
        Show Warning
      </button>
      <button onClick={() => info('Info!', 'Just so you know')}>
        Show Info
      </button>
      <button onClick={() => loading('Loading...', 'Please wait')}>
        Show Loading
      </button>
      <button onClick={clearAll}>Clear All</button>
    </div>
  )
}

const renderWithProvider = (component: React.ReactElement) => {
  return render(
    <NotificationProvider>
      {component}
    </NotificationProvider>
  )
}

describe('FeedbackSystem', () => {
  beforeEach(() => {
    jest.clearAllTimers()
    jest.useFakeTimers()
  })

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
  })

  describe('NotificationProvider', () => {
    test('renders children correctly', () => {
      renderWithProvider(<div data-testid="test-child">Test Child</div>)
      expect(screen.getByTestId('test-child')).toBeInTheDocument()
    })
  })

  describe('useNotifications hook', () => {
    test('shows success notification', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithProvider(<TestComponent />)

      await user.click(screen.getByText('Show Success'))

      expect(screen.getByText('Success!')).toBeInTheDocument()
      expect(screen.getByText('Operation completed')).toBeInTheDocument()
    })

    test('shows error notification', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithProvider(<TestComponent />)

      await user.click(screen.getByText('Show Error'))

      expect(screen.getByText('Error!')).toBeInTheDocument()
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    test('shows warning notification', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithProvider(<TestComponent />)

      await user.click(screen.getByText('Show Warning'))

      expect(screen.getByText('Warning!')).toBeInTheDocument()
      expect(screen.getByText('Please be careful')).toBeInTheDocument()
    })

    test('shows info notification', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithProvider(<TestComponent />)

      await user.click(screen.getByText('Show Info'))

      expect(screen.getByText('Info!')).toBeInTheDocument()
      expect(screen.getByText('Just so you know')).toBeInTheDocument()
    })

    test('shows loading notification', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithProvider(<TestComponent />)

      await user.click(screen.getByText('Show Loading'))

      expect(screen.getByText('Loading...')).toBeInTheDocument()
      expect(screen.getByText('Please wait')).toBeInTheDocument()
    })

    test('auto-removes non-persistent notifications', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithProvider(<TestComponent />)

      await user.click(screen.getByText('Show Success'))
      expect(screen.getByText('Success!')).toBeInTheDocument()

      // Fast-forward time to trigger auto-removal
      act(() => {
        jest.advanceTimersByTime(5000)
      })

      await waitFor(() => {
        expect(screen.queryByText('Success!')).not.toBeInTheDocument()
      })
    })

    test('clears all notifications', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithProvider(<TestComponent />)

      // Add multiple notifications
      await user.click(screen.getByText('Show Success'))
      await user.click(screen.getByText('Show Error'))
      await user.click(screen.getByText('Show Loading'))

      expect(screen.getByText('Success!')).toBeInTheDocument()
      expect(screen.getByText('Error!')).toBeInTheDocument()
      expect(screen.getByText('Loading...')).toBeInTheDocument()

      // Clear all
      await user.click(screen.getByText('Clear All'))

      expect(screen.queryByText('Success!')).not.toBeInTheDocument()
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    test('removes individual notification when close button clicked', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithProvider(<TestComponent />)

      await user.click(screen.getByText('Show Success'))
      expect(screen.getByText('Success!')).toBeInTheDocument()

      // Find and click close button
      const closeButton = screen.getByRole('button', { name: /close notification/i })
      await user.click(closeButton)

      expect(screen.queryByText('Success!')).not.toBeInTheDocument()
    })
  })

  describe('NotificationItem', () => {
    test('displays correct icon for each notification type', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithProvider(<TestComponent />)

      // Test success icon
      await user.click(screen.getByText('Show Success'))
      expect(screen.getByTestId('check-circle-icon')).toBeInTheDocument()

      // Clear and test error icon
      await user.click(screen.getByText('Clear All'))
      await user.click(screen.getByText('Show Error'))
      expect(screen.getByTestId('x-circle-icon')).toBeInTheDocument()

      // Clear and test warning icon
      await user.click(screen.getByText('Clear All'))
      await user.click(screen.getByText('Show Warning'))
      expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument()

      // Clear and test info icon
      await user.click(screen.getByText('Clear All'))
      await user.click(screen.getByText('Show Info'))
      expect(screen.getByTestId('info-icon')).toBeInTheDocument()

      // Clear and test loading icon
      await user.click(screen.getByText('Clear All'))
      await user.click(screen.getByText('Show Loading'))
      expect(screen.getByTestId('loading-icon')).toBeInTheDocument()
    })

    test('applies correct background color for each notification type', async () => {
      const user = userEvent.setup({ delay: null })
      renderWithProvider(<TestComponent />)

      await user.click(screen.getByText('Show Success'))
      const successNotification = screen.getByText('Success!').closest('[class*="bg-green-50"]')
      expect(successNotification).toHaveClass('bg-green-50', 'border-green-200')
    })
  })
})
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatCard from './StatCard';

describe('StatCard', () => {
  it('renders title and value correctly', () => {
    render(<StatCard title="Total Sales" value={1500} icon={<span data-testid="icon" />} />);

    expect(screen.getByText('Total Sales')).toBeInTheDocument();
    expect(screen.getByText(/1\s?500/)).toBeInTheDocument(); // 1500 formatted to locale string with robust space matching
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders suffix if provided', () => {
    render(<StatCard title="Debt" value={100} icon={<span />} suffix="som" />);

    expect(screen.getByText('som')).toBeInTheDocument();
  });

  it('shows skeleton when isLoading is true', () => {
    const { container } = render(<StatCard title="Loading" value={0} icon={<span />} isLoading />);
    expect(container.querySelector('.ant-skeleton')).toBeInTheDocument();
  });
});

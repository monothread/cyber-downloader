// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { BridgeMissing } from '@renderer/components/BridgeMissing';

describe('BridgeMissing', () => {
    it('explains that the buttons cannot work and where the diagnostic log is', () => {
        render(<BridgeMissing />);
        expect(screen.getByRole('heading', { name: 'PULLWAVE' })).toBeInTheDocument();
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('THE INTERFACE COULD NOT CONNECT TO THE APP');
        expect(alert).toHaveTextContent('The buttons cannot work until this is fixed.');
        expect(alert).toHaveTextContent('diagnostic.log');
        expect(alert).toHaveTextContent('%APPDATA%\\pullwave');
    });

    it('has no buttons of its own', () => {
        render(<BridgeMissing />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});

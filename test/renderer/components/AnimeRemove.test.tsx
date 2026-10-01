// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { AnimeRemove } from '@renderer/components/AnimeRemove';
import { useAppStore } from '@renderer/store/appStore';
import { installMockApi } from '../../helpers/mockApi';

const initialApp = useAppStore.getState();

beforeEach(() => {
    installMockApi();
    useAppStore.setState({ ...initialApp, settings: DEFAULT_SETTINGS });
});

function setup() {
    const onRemove = vi.fn();
    render(<AnimeRemove label="REMOVE" ariaLabel="Remove: Naruto EP 1" onRemove={onRemove} />);
    return { onRemove, user: userEvent.setup() };
}

describe('AnimeRemove', () => {
    it('only shows the button at first', () => {
        const { onRemove } = setup();
        expect(screen.getByRole('button', { name: 'Remove: Naruto EP 1' })).toHaveTextContent('REMOVE');
        expect(screen.queryByRole('button', { name: 'CONFIRM' })).not.toBeInTheDocument();
        expect(onRemove).not.toHaveBeenCalled();
    });

    it('asks first, warning that the files go too, and then removes', async () => {
        const { onRemove, user } = setup();
        await user.click(screen.getByRole('button', { name: 'Remove: Naruto EP 1' }));
        expect(screen.getByRole('group', { name: 'Remove: Naruto EP 1' })).toBeInTheDocument();
        expect(screen.getByText('The files are deleted from the disk too.')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(onRemove).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'CONFIRM' }));
        expect(onRemove).toHaveBeenCalledTimes(1);
        expect(onRemove).toHaveBeenCalledWith();
        expect(screen.getByRole('button', { name: 'Remove: Naruto EP 1' })).toBeInTheDocument();
    });

    it('goes back without removing', async () => {
        const { onRemove, user } = setup();
        await user.click(screen.getByRole('button', { name: 'Remove: Naruto EP 1' }));
        await user.click(screen.getByRole('button', { name: 'KEEP' }));

        expect(onRemove).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Remove: Naruto EP 1' })).toBeInTheDocument();
        expect(screen.queryByText('The files are deleted from the disk too.')).not.toBeInTheDocument();
    });
});

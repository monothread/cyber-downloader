// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { DEFAULT_SETTINGS } from '@shared/constants';
import type { DownloadOptions, Settings } from '@shared/types';
import { DownloadOptionsDialog } from '@renderer/components/DownloadOptionsDialog';
import { useAppStore } from '@renderer/store/appStore';

const initial = useAppStore.getState();

beforeEach(() => {
    useAppStore.setState({ ...initial, settings: DEFAULT_SETTINGS });
});

function setup(options: DownloadOptions = {}, settings: Settings = DEFAULT_SETTINGS, linkNumber = 2) {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<DownloadOptionsDialog linkNumber={linkNumber} options={options} settings={settings} onApply={onApply} onClose={onClose} />);
    return { onApply, onClose };
}

function optionTexts(label: string): string[] {
    return Array.from(screen.getByLabelText(label).querySelectorAll('option')).map((option) => {
        return option.textContent ?? '';
    });
}

describe('DownloadOptionsDialog layout', () => {
    it('is a modal dialog named after the link, with an explanation and both groups', () => {
        setup();
        const dialog = screen.getByRole('dialog', { name: 'Options for link 2' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(within(dialog).getByText('Only what you change here applies to this download. Everything else follows the Settings.')).toBeInTheDocument();
        expect(within(dialog).getByText('QUALITY & FORMAT')).toBeInTheDocument();
        expect(within(dialog).getByText('LIVE STREAMS')).toBeInTheDocument();
    });

    it('starts every field on the setting and shows its current value', () => {
        setup();
        expect(optionTexts('Video quality')).toEqual(['Use the setting (Best available)', 'Best available', 'Up to 2160p', 'Up to 1440p', 'Up to 1080p', 'Up to 720p', 'Up to 480p']);
        expect(optionTexts('Video container')).toEqual(['Use the setting (mp4)', 'mp4', 'mkv', 'webm']);
        expect(optionTexts('Audio only')).toEqual(['Use the setting (Off)', 'On', 'Off']);
        expect(optionTexts('Audio format')).toEqual(['Use the setting (mp3)', 'mp3', 'm4a', 'opus']);
        expect(optionTexts('Record live streams from the start')).toEqual(['Use the setting (Off)', 'On', 'Off']);
        expect(optionTexts('Wait for scheduled live streams to start')).toEqual(['Use the setting (Off)', 'On', 'Off']);
        expect(optionTexts('Double-check that a live stream really ended')).toEqual(['Use the setting (On)', 'On', 'Off']);
        ['Video quality', 'Video container', 'Audio only', 'Audio format', 'Record live streams from the start', 'Wait for scheduled live streams to start', 'Double-check that a live stream really ended'].forEach((label) => {
            expect(screen.getByLabelText(label)).toHaveValue('');
        });
        expect(screen.getByLabelText('Seconds to keep checking')).toHaveValue(null);
        expect(screen.getByLabelText('Seconds to keep checking')).toHaveAttribute('placeholder', 'Use the setting (10)');
    });

    it('shows the values of the settings that are not the defaults', () => {
        setup({}, { ...DEFAULT_SETTINGS, maxResolution: '720', videoContainer: 'webm', audioOnly: true, audioFormat: 'opus', waitForLive: true, verifyLiveEnd: false, verifyLiveEndSeconds: 45 });
        expect(optionTexts('Video quality')[0]).toBe('Use the setting (Up to 720p)');
        expect(optionTexts('Video container')[0]).toBe('Use the setting (webm)');
        expect(optionTexts('Audio only')[0]).toBe('Use the setting (On)');
        expect(optionTexts('Audio format')[0]).toBe('Use the setting (opus)');
        expect(optionTexts('Wait for scheduled live streams to start')[0]).toBe('Use the setting (On)');
        expect(optionTexts('Double-check that a live stream really ended')[0]).toBe('Use the setting (Off)');
        expect(screen.getByLabelText('Seconds to keep checking')).toHaveAttribute('placeholder', 'Use the setting (45)');
    });

    it('shows the options the link already has', () => {
        setup({ maxResolution: '1080', videoContainer: 'mkv', audioOnly: false, audioFormat: 'm4a', liveFromStart: true, waitForLive: false, verifyLiveEnd: true, verifyLiveEndSeconds: 30 });
        expect(screen.getByLabelText('Video quality')).toHaveValue('1080');
        expect(screen.getByLabelText('Video container')).toHaveValue('mkv');
        expect(screen.getByLabelText('Audio only')).toHaveValue('off');
        expect(screen.getByLabelText('Audio format')).toHaveValue('m4a');
        expect(screen.getByLabelText('Record live streams from the start')).toHaveValue('on');
        expect(screen.getByLabelText('Wait for scheduled live streams to start')).toHaveValue('off');
        expect(screen.getByLabelText('Double-check that a live stream really ended')).toHaveValue('on');
        expect(screen.getByLabelText('Seconds to keep checking')).toHaveValue(30);
    });

    it('is written in the language of the app', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, language: 'pt' } });
        setup({}, { ...DEFAULT_SETTINGS, language: 'pt' }, 1);
        expect(screen.getByRole('dialog', { name: 'Opções do link 1' })).toBeInTheDocument();
        expect(screen.getByText('Só o que você mudar aqui vale para este download. O resto segue as Configurações.')).toBeInTheDocument();
        expect(optionTexts('Qualidade do vídeo')[0]).toBe('Usar a configuração (A melhor disponível)');
        expect(screen.getByRole('button', { name: 'APLICAR' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CANCELAR' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'REDEFINIR' })).toBeInTheDocument();
    });
});

describe('DownloadOptionsDialog choices', () => {
    it('applies only what was changed', async () => {
        const user = userEvent.setup();
        const { onApply, onClose } = setup();
        await user.selectOptions(screen.getByLabelText('Video quality'), '720');
        await user.selectOptions(screen.getByLabelText('Audio only'), 'on');
        await user.click(screen.getByRole('button', { name: 'APPLY' }));
        expect(onApply).toHaveBeenCalledTimes(1);
        expect(onApply).toHaveBeenCalledWith({ maxResolution: '720', audioOnly: true });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('applies nothing when nothing was changed', async () => {
        const { onApply } = setup();
        await userEvent.setup().click(screen.getByRole('button', { name: 'APPLY' }));
        expect(onApply).toHaveBeenCalledWith({});
    });

    it('can choose every field', async () => {
        const user = userEvent.setup();
        const { onApply } = setup();
        await user.selectOptions(screen.getByLabelText('Video quality'), 'best');
        await user.selectOptions(screen.getByLabelText('Video container'), 'webm');
        await user.selectOptions(screen.getByLabelText('Audio only'), 'off');
        await user.selectOptions(screen.getByLabelText('Audio format'), 'opus');
        await user.selectOptions(screen.getByLabelText('Record live streams from the start'), 'on');
        await user.selectOptions(screen.getByLabelText('Wait for scheduled live streams to start'), 'on');
        await user.selectOptions(screen.getByLabelText('Double-check that a live stream really ended'), 'off');
        await user.click(screen.getByRole('button', { name: 'APPLY' }));
        expect(onApply).toHaveBeenCalledWith({
            maxResolution: 'best',
            videoContainer: 'webm',
            audioOnly: false,
            audioFormat: 'opus',
            liveFromStart: true,
            waitForLive: true,
            verifyLiveEnd: false
        });
    });

    it('goes back to following the setting when the first entry is chosen again', async () => {
        const user = userEvent.setup();
        const { onApply } = setup({ maxResolution: '720', videoContainer: 'mkv', audioOnly: true, audioFormat: 'opus' });
        await user.selectOptions(screen.getByLabelText('Video quality'), '');
        await user.selectOptions(screen.getByLabelText('Video container'), '');
        await user.selectOptions(screen.getByLabelText('Audio only'), '');
        await user.selectOptions(screen.getByLabelText('Audio format'), '');
        await user.click(screen.getByRole('button', { name: 'APPLY' }));
        expect(onApply).toHaveBeenCalledWith({});
    });

    it('keeps the options that were already there when others are changed', async () => {
        const user = userEvent.setup();
        const { onApply } = setup({ videoContainer: 'mkv' });
        await user.selectOptions(screen.getByLabelText('Audio format'), 'm4a');
        await user.click(screen.getByRole('button', { name: 'APPLY' }));
        expect(onApply).toHaveBeenCalledWith({ videoContainer: 'mkv', audioFormat: 'm4a' });
    });
});

describe('DownloadOptionsDialog seconds of the end check', () => {
    it('is enabled while the check is on in the settings', () => {
        setup();
        expect(screen.getByLabelText('Seconds to keep checking')).toBeEnabled();
    });

    it('is disabled while the check is off in the settings, and enabled when this download turns it on', async () => {
        setup({}, { ...DEFAULT_SETTINGS, verifyLiveEnd: false });
        expect(screen.getByLabelText('Seconds to keep checking')).toBeDisabled();
        await userEvent.setup().selectOptions(screen.getByLabelText('Double-check that a live stream really ended'), 'on');
        expect(screen.getByLabelText('Seconds to keep checking')).toBeEnabled();
    });

    it('is disabled when this download turns the check off', async () => {
        setup();
        await userEvent.setup().selectOptions(screen.getByLabelText('Double-check that a live stream really ended'), 'off');
        expect(screen.getByLabelText('Seconds to keep checking')).toBeDisabled();
    });

    it('applies the seconds that were typed', async () => {
        const { onApply } = setup();
        fireEvent.change(screen.getByLabelText('Seconds to keep checking'), { target: { value: '25' } });
        await userEvent.setup().click(screen.getByRole('button', { name: 'APPLY' }));
        expect(onApply).toHaveBeenCalledWith({ verifyLiveEndSeconds: 25 });
    });

    it.each([
        ['0', 1],
        ['-5', 1],
        ['500', 120],
        ['7.6', 8]
    ])('clamps %s to %j when applying', async (typed, expected) => {
        const { onApply } = setup();
        fireEvent.change(screen.getByLabelText('Seconds to keep checking'), { target: { value: typed } });
        await userEvent.setup().click(screen.getByRole('button', { name: 'APPLY' }));
        expect(onApply).toHaveBeenCalledWith({ verifyLiveEndSeconds: expected });
    });

    it('goes back to the setting when the field is emptied', async () => {
        const { onApply } = setup({ verifyLiveEndSeconds: 30 });
        fireEvent.change(screen.getByLabelText('Seconds to keep checking'), { target: { value: '' } });
        await userEvent.setup().click(screen.getByRole('button', { name: 'APPLY' }));
        expect(onApply).toHaveBeenCalledWith({});
    });
});

describe('DownloadOptionsDialog buttons', () => {
    it('cancels without applying what was changed', async () => {
        const user = userEvent.setup();
        const { onApply, onClose } = setup();
        await user.selectOptions(screen.getByLabelText('Video quality'), '720');
        await user.click(screen.getByRole('button', { name: 'CANCEL' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onApply).not.toHaveBeenCalled();
    });

    it('resets every field to following the setting, and is disabled while there is nothing to reset', async () => {
        const user = userEvent.setup();
        const { onApply } = setup();
        expect(screen.getByRole('button', { name: 'RESET' })).toBeDisabled();
        await user.selectOptions(screen.getByLabelText('Video quality'), '720');
        await user.selectOptions(screen.getByLabelText('Audio only'), 'on');
        expect(screen.getByRole('button', { name: 'RESET' })).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'RESET' }));
        expect(screen.getByLabelText('Video quality')).toHaveValue('');
        expect(screen.getByLabelText('Audio only')).toHaveValue('');
        expect(screen.getByRole('button', { name: 'RESET' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'APPLY' }));
        expect(onApply).toHaveBeenCalledWith({});
    });

    it('can reset the options the link already had', async () => {
        const user = userEvent.setup();
        setup({ maxResolution: '480' });
        expect(screen.getByRole('button', { name: 'RESET' })).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'RESET' }));
        expect(screen.getByLabelText('Video quality')).toHaveValue('');
    });
});

describe('DownloadOptionsDialog keyboard and focus', () => {
    it('focuses the first field when it opens', () => {
        setup();
        expect(screen.getByLabelText('Video quality')).toHaveFocus();
    });

    it('closes with Escape', async () => {
        const { onClose, onApply } = setup();
        await userEvent.setup().keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onApply).not.toHaveBeenCalled();
    });

    it('closes when the dark area around it is pressed, but not when the window itself is', () => {
        const { onClose } = setup();
        const dialog = screen.getByRole('dialog');
        fireEvent.mouseDown(dialog);
        fireEvent.mouseDown(screen.getByText('QUALITY & FORMAT'));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.mouseDown(dialog.parentElement as HTMLElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps Tab inside the window, from the last button back to the first field and the other way round', async () => {
        const user = userEvent.setup();
        setup();
        const first = screen.getByLabelText('Video quality');
        const last = screen.getByRole('button', { name: 'APPLY' });
        last.focus();
        await user.tab();
        expect(first).toHaveFocus();
        await user.tab({ shift: true });
        expect(last).toHaveFocus();
    });

    it('moves normally with Tab in the middle of the window', async () => {
        const user = userEvent.setup();
        setup();
        await user.tab();
        expect(screen.getByLabelText('Video container')).toHaveFocus();
        await user.tab({ shift: true });
        expect(screen.getByLabelText('Video quality')).toHaveFocus();
    });

    it('ignores the other keys', async () => {
        const { onClose } = setup();
        await userEvent.setup().keyboard('a');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('gives the focus back to the button that opened it', async () => {
        const user = userEvent.setup();
        function Host() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button
                        type="button"
                        onClick={() => {
                            setOpen(true);
                        }}
                    >
                        open
                    </button>
                    {open && (
                        <DownloadOptionsDialog
                            linkNumber={1}
                            options={{}}
                            settings={DEFAULT_SETTINGS}
                            onApply={() => {
                                setOpen(false);
                            }}
                            onClose={() => {
                                setOpen(false);
                            }}
                        />
                    )}
                </>
            );
        }
        render(<Host />);
        const opener = screen.getByRole('button', { name: 'open' });
        await user.click(opener);
        expect(screen.getByLabelText('Video quality')).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });
});

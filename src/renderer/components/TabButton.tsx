// The gear of the settings tabs. The text selector (U+FE0E) keeps it a plain glyph that follows the colour of the tab.
export const SETTINGS_ICON = '⚙︎';

interface TabButtonProps {
    label: string;
    active: boolean;
    // A glyph shown in place of the label, which then only names the tab for the screen readers and the tooltip. The tab goes to the
    // right end of its bar.
    icon?: string;
    onClick: () => void;
}

export function TabButton({ label, active, icon, onClick }: TabButtonProps) {
    const classes = ['tab', icon === undefined ? '' : 'tab--icon', active ? 'tab--active' : ''].filter(Boolean).join(' ');
    return (
        <button
            type="button"
            className={classes}
            aria-current={active ? 'page' : undefined}
            aria-label={icon === undefined ? undefined : label}
            title={icon === undefined ? undefined : label}
            onClick={onClick}
        >
            {icon === undefined ? label : <span aria-hidden="true">{icon}</span>}
        </button>
    );
}

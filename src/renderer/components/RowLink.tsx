import type { ReactNode } from 'react';

interface RowLinkProps {
    // What the button is called for the screen readers (the text of the row is its title).
    label: string;
    onClick: () => void;
    // For a row that opens and closes: whether it is open.
    expanded?: boolean;
    title?: string;
    children: ReactNode;
}

// The title of a row or a card that is opened by clicking anywhere on it. It is a real button, so the keyboard and the screen
// readers work as they do for any button; its area is stretched over the row (see `.row--link` in the theme) and the other buttons
// of the row stay above it. The row needs the class `row--link`.
export function RowLink({ label, onClick, expanded, title, children }: RowLinkProps) {
    return (
        <button type="button" className="row-link" aria-label={label} aria-expanded={expanded} title={title} onClick={onClick}>
            <span className="row-link__text">{children}</span>
        </button>
    );
}

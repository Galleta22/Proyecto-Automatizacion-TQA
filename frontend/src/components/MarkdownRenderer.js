import React from "react";

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function renderLine(line, i) {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Headings: ### text or ## text or # text
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
        const level = headingMatch[1].length;
        const text = escapeHtml(headingMatch[2]);
        const Tag = `h${level}`;
        return <Tag key={i} style={{ margin: "0.5rem 0", color: "var(--accent-ink)" }}>{text}</Tag>;
    }

    // Bold: **text**
    // Italic: *text*
    // Both: ***text***
    const rendered = escapeHtml(trimmed)
        .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");

    return (
        <p
            key={i}
            style={{ margin: "0.25rem 0", color: "var(--ink)", lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: rendered }}
        />
    );
}

export default function MarkdownRenderer({ content }) {
    if (!content) return null;
    const lines = content.split("\n");
    return <div>{lines.map(renderLine)}</div>;
}

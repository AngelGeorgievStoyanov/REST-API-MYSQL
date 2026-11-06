export interface AuthEmailTemplateOptions {
    title: string;
    description: string;
    buttonLabel: string;
    expiry: string;
    link: string;
}

/** Shared responsive HTML template for authentication emails. */
export function renderAuthEmailTemplate({
    title,
    description,
    buttonLabel,
    expiry,
    link
}: AuthEmailTemplateOptions): string {
    const safeTitle = escapeHtml(title);
    const safeDescription = escapeHtml(description);
    const safeButtonLabel = escapeHtml(buttonLabel);
    const safeExpiry = escapeHtml(expiry);
    const safeLink = escapeHtml(link);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;font-size:1px;color:#f3f6fb;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
        ${safeDescription}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f6fb;padding:36px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:14px;overflow:hidden;">
                    <tr>
                        <td align="center" style="background-color:#10243a;padding:28px 24px;">
                            <div style="font-size:25px;line-height:30px;font-weight:800;letter-spacing:1.5px;color:#ffffff;">HACK-TRIP</div>
                            <div style="margin-top:7px;font-size:11px;line-height:16px;letter-spacing:2px;color:#a9c5df;">TRAVEL SMARTER</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:38px 36px 20px;">
                            <h1 style="margin:0 0 16px;font-size:25px;line-height:32px;font-weight:700;color:#172033;">${safeTitle}</h1>
                            <p style="margin:0;font-size:15px;line-height:25px;color:#526174;">${safeDescription}</p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:18px 36px 30px;">
                            <a href="${safeLink}" target="_blank" style="display:inline-block;background-color:#1976d2;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:700;letter-spacing:.4px;padding:15px 25px;border-radius:7px;">${safeButtonLabel}</a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 36px 30px;">
                            <p style="margin:0;font-size:13px;line-height:21px;color:#718096;">${safeExpiry}</p>
                            <p style="margin:18px 0 0;font-size:13px;line-height:21px;color:#718096;">If the button doesn't work, copy and paste this link into your browser:<br>
                                <a href="${safeLink}" style="color:#1976d2;word-break:break-all;">${safeLink}</a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="border-top:1px solid #e8edf3;padding:20px 24px;">
                            <p style="margin:0;font-size:12px;line-height:19px;color:#91a0b2;">© HACK-TRIP · Travel smarter</p>
                            <p style="margin:5px 0 0;font-size:11px;line-height:17px;color:#a0adbb;">This is an automated email. Please do not reply.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

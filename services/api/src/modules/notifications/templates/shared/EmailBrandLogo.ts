import { EmailColors, EmailTypography } from './email-tokens';

export function renderEmailBrandLogo(fontSize = '22px', textColor = EmailColors.textHeadline): string {
  return `<span class="email-headline-text" style="font-size: ${fontSize}; font-weight: ${EmailTypography.fontWeightBold}; color: ${textColor}; letter-spacing: -0.5px; font-family: ${EmailTypography.fontFamily}; display: inline-block; text-decoration: none;">` +
    `Rapt<span style="position: relative; display: inline-block;">o<span style="position: absolute; top: 3px; right: -5px; width: 6px; height: 6px; background-color: #22c55e; border-radius: 50%; display: inline-block; box-shadow: 0 0 8px rgba(34,197,94,0.8);"></span></span>` +
    `</span>`;
}

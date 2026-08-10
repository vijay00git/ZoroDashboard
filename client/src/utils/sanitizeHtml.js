import DOMPurify from 'dompurify';

// `marked` (v5+) does not sanitize raw HTML in the markdown it renders, so
// any markdown/AI-generated text containing a <script> or an onerror=
// attribute would otherwise execute in the app's origin once handed to
// dangerouslySetInnerHTML. Run every marked() result through this first.
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html || '');
}

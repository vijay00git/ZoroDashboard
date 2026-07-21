import { createPortal } from 'react-dom';

// Renders directly into document.body. Required because the page-transition
// wrapper in App.jsx animates `transform` with `animation-fill-mode: forwards`,
// which leaves a persistent transform on the ancestor after the animation
// ends — per spec that makes it a containing block for `position: fixed`
// descendants, so an un-portaled overlay would be clipped/offset to that
// ancestor instead of covering the viewport.
const ModalPortal = ({ children }) => createPortal(children, document.body);

export default ModalPortal;

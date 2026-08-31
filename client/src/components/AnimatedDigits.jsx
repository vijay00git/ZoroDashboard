/* Renders a string one character at a time, each in its own span keyed by
   its position + value — so a digit only replays its fade-in animation when
   its own value actually changes, not on every parent re-render. */
const AnimatedDigits = ({ text }) => (
  <>
    {String(text).split('').map((ch, i) => (
      <span key={`${i}-${ch}`} className="animated-digit">{ch}</span>
    ))}
  </>
);

export default AnimatedDigits;

// Animated sliding-knob toggle — a styled wrapper around a real checkbox
// input, so it keeps native form semantics (keyboard, onChange) instead of
// reinventing them.
const ToggleSwitch = ({ checked, onChange, label, disabled }) => (
  <label className={`toggle-switch${disabled ? ' is-disabled' : ''}`}>
    <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
    <span className="toggle-switch-track"><span className="toggle-switch-knob" /></span>
    {label && <span className="toggle-switch-label">{label}</span>}
  </label>
);

export default ToggleSwitch;

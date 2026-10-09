import { useState } from 'react';
import { Wrench, Smartphone } from 'lucide-react';
import DeviceCheckerTool from './helper-tools/DeviceCheckerTool';
import './helper-tools/HelperTools.css';

// A growing grab-bag of small ops utilities — add a new entry here (and a
// matching component under helper-tools/) whenever a new tool idea shows up.
// Each tool owns its own state/data entirely; this shell only picks which
// one is visible.
const TOOLS = [
  {
    id: 'device-checker',
    label: 'Node Device Checker',
    icon: Smartphone,
    component: DeviceCheckerTool,
  },
];

const HelperTools = () => {
  const [activeId, setActiveId] = useState(TOOLS[0].id);
  const active = TOOLS.find((t) => t.id === activeId) || TOOLS[0];
  const ActiveComponent = active.component;

  return (
    <div className="ht">
      <div className="ht-title-hero">
        <h1><Wrench size={20} /> Helper Tools</h1>
        <p>A growing toolbox of small ops utilities — add a new one here whenever a new tool idea shows up.</p>
      </div>

      <div className="ht-layout">
        <div className="ht-tool-list">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                className={`ht-tool-item${t.id === activeId ? ' active' : ''}`}
                onClick={() => setActiveId(t.id)}
              >
                <Icon size={16} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="ht-tool-panel">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
};

export default HelperTools;

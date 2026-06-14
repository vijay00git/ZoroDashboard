import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import confetti from 'canvas-confetti';
import { 
  BookOpen, 
  Trash2, 
  Plus, 
  CheckCircle, 
  Circle, 
  Play, 
  ArrowRight, 
  Award,
  Sparkles,
  Download,
  HelpCircle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { showAlert, showConfirm } from '../utils/Alerts';

const LearnSkills = () => {
  // --- State ---
  const [library, setLibrary] = useState([]);
  const [currentGoalId, setCurrentGoalId] = useState('new');
  const [newGoalName, setNewGoalName] = useState('');
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [activeModuleName, setActiveModuleName] = useState('');
  const [lessonContent, setLessonContent] = useState('');
  const [lessonLoading, setLessonLoading] = useState(false);
  const [isMarkingCompleted, setIsMarkingCompleted] = useState(false);
  const [expandedModules, setExpandedModules] = useState({});
  const [customTopicTitle, setCustomTopicTitle] = useState('');

  // Q&A State
  const [qaInput, setQaInput] = useState('');
  const [qaHistory, setQaHistory] = useState([]);
  const [qaLoading, setQaLoading] = useState(false);

  // Generate Loader
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);

  // --- Initialize ---
  useEffect(() => {
    const savedLibrary = localStorage.getItem('tr-goals-library');
    if (savedLibrary) {
      const parsed = JSON.parse(savedLibrary);
      setLibrary(parsed);
      
      const savedActiveId = localStorage.getItem('tr-goals-active-id');
      if (savedActiveId && parsed.some(g => g.id === savedActiveId)) {
        setCurrentGoalId(savedActiveId);
      } else if (parsed.length > 0) {
        setCurrentGoalId(parsed[0].id);
      }
    }
  }, []);

  // Sync back to localStorage when library/activeGoal changes
  const saveLibrary = (newLib, activeId) => {
    setLibrary(newLib);
    localStorage.setItem('tr-goals-library', JSON.stringify(newLib));
    if (activeId) {
      setCurrentGoalId(activeId);
      localStorage.setItem('tr-goals-active-id', activeId);
    }
  };

  useEffect(() => {
    if (library.length > 0) {
      const active = library.find(g => g.id === currentGoalId);
      if (active && active.roadmap.length > 0 && Object.keys(expandedModules).length === 0) {
        setExpandedModules({ [active.roadmap[0].id || 0]: true });
      }
    }
  }, [currentGoalId, library]);

  // Find active goal
  const activeGoal = library.find(g => g.id === currentGoalId) || null;

  // Normalize activeGoal roadmap
  const getNormalizedRoadmap = () => {
    if (!activeGoal || !activeGoal.roadmap) return [];
    let displayRoadmap = activeGoal.roadmap;
    if (displayRoadmap[0] && !displayRoadmap[0].subtopics) {
      return [{ id: 'mod_flat', module: 'General Topics', subtopics: activeGoal.roadmap }];
    }
    return displayRoadmap;
  };

  const roadmap = getNormalizedRoadmap();

  // Find active topic
  const getActiveTopic = () => {
    if (!activeTopicId || !activeGoal) return null;
    for (const mod of roadmap) {
      const t = mod.subtopics.find(x => x.id === activeTopicId);
      if (t) return t;
    }
    return null;
  };

  const activeTopic = getActiveTopic();

  // Calculate XP and level
  const calculateTotalXP = () => {
    let completed = 0;
    roadmap.forEach(m => {
      completed += m.subtopics.filter(t => t.completed).length;
    });
    return completed * 10;
  };

  const activeXP = calculateTotalXP();

  const getLevelData = (xp) => {
    if (xp < 100) return { title: 'Novice', min: 0, max: 100, pct: xp, icon: '🥚' };
    if (xp < 300) return { title: 'Apprentice', min: 100, max: 300, pct: ((xp - 100) / 200) * 100, icon: '🌱' };
    if (xp < 600) return { title: 'Scholar', min: 300, max: 600, pct: ((xp - 300) / 300) * 100, icon: '📘' };
    if (xp < 1000) return { title: 'Expert', min: 600, max: 1000, pct: ((xp - 600) / 400) * 100, icon: '🔥' };
    return { title: 'Grandmaster', min: 1000, max: 1000, pct: 100, icon: '👑' };
  };

  const levelInfo = getLevelData(activeXP);

  // --- API Call helper ---
  const callAI = async (prompt, system) => {
    const key = localStorage.getItem('zoro-ai-key');
    const model = localStorage.getItem('zoro-ai-model') || 'gemini-1.5-flash-8b';

    if (!key) {
      throw new Error("Please set your Gemini API key in Settings first!");
    }

    const res = await fetch('http://localhost:3000/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, model, system, prompt })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown server error' }));
      throw new Error(err.error || `Error ${res.status}`);
    }

    const data = await res.json();
    return data.text;
  };

  // --- Handlers ---
  const handleCreateGoal = async (e) => {
    e.preventDefault();
    if (!newGoalName.trim()) return;

    setGeneratingRoadmap(true);
    try {
      const prompt = `I want to learn: ${newGoalName}. Generate a comprehensive, step-by-step roadmap. Break it down into major Modules, and under each module provide small, bite-sized topics. 
      Return ONLY a valid JSON array of objects. Do not include markdown formatting like \`\`\`json.
      Format exactly like this:
      [
        {
          "module": "Module 1 Name",
          "topics": ["Tiny Topic 1", "Tiny Topic 2", "Tiny Topic 3"]
        },
        {
          "module": "Module 2 Name",
          "topics": ["Tiny Topic 4"]
        }
      ]`;
      const system = "You are an expert tutor AI returning raw JSON arrays. NO MARKDOWN.";
      
      const response = await callAI(prompt, system);
      const cleaned = response.replace(/^```json/im, '').replace(/^```/im, '').replace(/```$/im, '').trim();
      const modules = JSON.parse(cleaned);

      if (!Array.isArray(modules)) throw new Error("AI did not return a valid list.");

      const newRoadmap = modules.map((m, mIdx) => ({
        id: 'mod_' + Date.now() + '_' + mIdx,
        module: m.module || `Module ${mIdx + 1}`,
        subtopics: (m.topics || []).map((t, tIdx) => ({
          id: 'top_' + Date.now() + '_' + mIdx + '_' + tIdx,
          title: t,
          completed: false,
          lessonContent: null
        }))
      }));

      const newGoal = {
        id: 'g_' + Date.now(),
        title: newGoalName,
        roadmap: newRoadmap
      };

      const updatedLib = [...library, newGoal];
      saveLibrary(updatedLib, newGoal.id);
      setNewGoalName('');
    } catch (err) {
      showAlert("Failed to generate learning roadmap: " + err.message);
    } finally {
      setGeneratingRoadmap(false);
    }
  };

  const handleDeleteGoal = async () => {
    if (await showConfirm("Permanently delete this learning goal and all its progress?")) {
      const updatedLib = library.filter(g => g.id !== currentGoalId);
      const nextActiveId = updatedLib.length > 0 ? updatedLib[0].id : 'new';
      saveLibrary(updatedLib, nextActiveId);
      setActiveTopicId(null);
      setLessonContent('');
      setQaHistory([]);
    }
  };

  const handleSelectGoal = (id) => {
    setCurrentGoalId(id);
    localStorage.setItem('tr-goals-active-id', id);
    setActiveTopicId(null);
    setLessonContent('');
    setQaHistory([]);
  };

  const toggleModuleExpand = (modId) => {
    setExpandedModules(prev => ({
      ...prev,
      [modId]: !prev[modId]
    }));
  };

  const handleAddCustomTopic = (e) => {
    e.preventDefault();
    if (!customTopicTitle.trim() || !activeGoal) return;

    const updatedLib = library.map(g => {
      if (g.id === activeGoal.id) {
        const copyRoadmap = [...g.roadmap];
        if (copyRoadmap.length === 0) {
          copyRoadmap.push({ id: 'mod_custom', module: 'Custom Topics', subtopics: [] });
        }
        const lastMod = copyRoadmap[copyRoadmap.length - 1];
        lastMod.subtopics = [
          ...lastMod.subtopics,
          {
            id: 'top_' + Date.now(),
            title: customTopicTitle,
            completed: false,
            lessonContent: null
          }
        ];
        return { ...g, roadmap: copyRoadmap };
      }
      return g;
    });

    saveLibrary(updatedLib, currentGoalId);
    setCustomTopicTitle('');
  };

  // Load lesson tutor content
  const handleLoadLesson = async (topicId, moduleName) => {
    if (!activeGoal) return;
    setActiveTopicId(topicId);
    setActiveModuleName(moduleName);
    setQaHistory([]);

    const goalCopy = { ...activeGoal };
    let matchingTopic = null;
    for (const m of goalCopy.roadmap) {
      const found = m.subtopics.find(t => t.id === topicId);
      if (found) {
        matchingTopic = found;
        break;
      }
    }

    if (!matchingTopic) return;

    if (matchingTopic.lessonContent) {
      setLessonContent(matchingTopic.lessonContent);
      return;
    }

    setLessonLoading(true);
    setLessonContent('');
    try {
      const modContext = moduleName ? `This is part of the "${moduleName}" module.` : '';
      const prompt = `Teach me about "${matchingTopic.title}" in the context of learning "${activeGoal.title}". ${modContext}
      Keep the lesson extremely focused, concise, and bite-sized. Provide real-world examples, and use code snippets if applicable. 
      Format the response using Markdown. Be encouraging and act as my personal expert tutor.`;
      const system = "You are an expert, friendly AI tutor. Use markdown formatting to make the lesson highly readable with headers, bullet points, and code blocks.";

      const response = await callAI(prompt, system);
      
      // Save content to library
      const updatedLib = library.map(g => {
        if (g.id === activeGoal.id) {
          const newRoadmap = g.roadmap.map(m => {
            const newSubs = m.subtopics.map(t => {
              if (t.id === topicId) {
                return { ...t, lessonContent: response };
              }
              return t;
            });
            return { ...m, subtopics: newSubs };
          });
          return { ...g, roadmap: newRoadmap };
        }
        return g;
      });

      saveLibrary(updatedLib, currentGoalId);
      setLessonContent(response);
    } catch (err) {
      setLessonContent(`### ❌ Error Loading Lesson\n\n${err.message}`);
    } finally {
      setLessonLoading(false);
    }
  };

  const handleMarkAsCompleted = () => {
    if (!activeGoal || !activeTopicId) return;

    const currentTitle = levelInfo.title;

    const updatedLib = library.map(g => {
      if (g.id === activeGoal.id) {
        const newRoadmap = g.roadmap.map(m => {
          const newSubs = m.subtopics.map(t => {
            if (t.id === activeTopicId) {
              return { ...t, completed: true };
            }
            return t;
          });
          return { ...m, subtopics: newSubs };
        });
        return { ...g, roadmap: newRoadmap };
      }
      return g;
    });

    saveLibrary(updatedLib, currentGoalId);

    // Celebration
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Check level up
    const nextXP = (updatedLib.find(g => g.id === activeGoal.id).roadmap.flatMap(m => m.subtopics).filter(t => t.completed).length) * 10;
    const nextLvlInfo = getLevelData(nextXP);
    if (nextLvlInfo.title !== currentTitle) {
      // Trigger double fireworks!
      setTimeout(() => {
        confetti({ particleCount: 150, angle: 60, spread: 80, origin: { x: 0 } });
        confetti({ particleCount: 150, angle: 120, spread: 80, origin: { x: 1 } });
      }, 500);
    }
  };

  const handleAskQuestion = async (e) => {
    e.preventDefault();
    if (!qaInput.trim() || !activeTopic || !activeGoal) return;

    const question = qaInput.trim();
    setQaInput('');
    setQaLoading(true);

    const userMessage = { role: 'user', text: question };
    setQaHistory(prev => [...prev, userMessage]);

    try {
      const prompt = `Context: I am learning about "${activeTopic.title}" in the context of "${activeGoal.title}". 
      I just read the lesson, and my question is: "${question}". 
      Please answer my question directly, concisely, and using markdown formatting.`;
      const system = "You are an expert tutor answering a follow-up question about the lesson you just provided.";

      const response = await callAI(prompt, system);
      
      setQaHistory(prev => [...prev, { role: 'assistant', text: response }]);
    } catch (err) {
      setQaHistory(prev => [...prev, { role: 'assistant', text: `❌ Failed to answer: ${err.message}` }]);
    } finally {
      setQaLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header with Level Badge */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '4px' }}>
            Learn <span className="gradient-text">Skills</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Master new disciplines with custom AI tutoring curricula.</p>
        </div>

        {activeGoal && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '12px 20px',
            minWidth: '300px',
            background: 'linear-gradient(135deg, rgba(20,20,20,0.6), rgba(30,30,40,0.8))',
            borderRadius: '16px',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Glossy overlay */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg, rgba(255,255,255,0.05), transparent)', pointerEvents: 'none' }} />
            
            <div style={{ 
              fontSize: '2.5rem', 
              filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))',
              transform: 'scale(1.1)'
            }}>{levelInfo.icon}</div>
            
            <div style={{ flexGrow: 1, zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <span style={{ fontWeight: '900', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '1px', background: 'linear-gradient(90deg, #fff, var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {levelInfo.title}
                </span>
                <span style={{ color: 'var(--accent-pink)', fontWeight: 'bold', fontSize: '0.85rem' }}>{activeXP} XP</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ 
                  width: `${levelInfo.pct}%`, 
                  height: '100%', 
                  background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-cyan))', 
                  boxShadow: '0 0 10px var(--accent-cyan)',
                  transition: 'width 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' 
                }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Two Column Workstation */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 2fr',
        gap: '24px',
        alignItems: 'start'
      }}>
        
        {/* Left Column: Goals & Roadmap Module Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Goal Select Card */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '12px' }}>Choose Learning Quest</h3>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <select
                value={currentGoalId}
                onChange={(e) => handleSelectGoal(e.target.value)}
                style={{
                  flexGrow: 1,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  outline: 'none',
                  fontWeight: '500'
                }}
              >
                <option value="new">+ Declare New Goal</option>
                {library.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>

              {activeGoal && (
                <button
                  onClick={handleDeleteGoal}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: 'var(--accent-red)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '10px',
                    padding: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Delete Quest"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>

            {currentGoalId === 'new' && (
              <form onSubmit={handleCreateGoal} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. Master React 19, Cypress E2E Testing"
                  value={newGoalName}
                  onChange={(e) => setNewGoalName(e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    outline: 'none',
                    fontSize: '0.9rem'
                  }}
                  required
                />
                <button
                  type="submit"
                  className="glow-btn"
                  disabled={generatingRoadmap}
                  style={{ justifyContent: 'center' }}
                >
                  {generatingRoadmap ? (
                    <>
                      <div className="spinner" style={{ width: '14px', height: '14px', marginRight: '6px' }}></div>
                      Creating Questline...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate AI Roadmap
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Quest Tree Node Navigation */}
          {activeGoal && (
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Quest Tree Nodes</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Click node to learn</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '450px', overflowY: 'auto', paddingRight: '4px' }} className="custom-scrollbar">
                {roadmap.map((mod, mIdx) => {
                  const isExpanded = expandedModules[mod.id || mIdx];
                  const total = mod.subtopics.length;
                  const completed = mod.subtopics.filter(t => t.completed).length;
                  const progressPct = total === 0 ? 0 : (completed / total) * 100;

                  return (
                    <div key={mod.id || mIdx} style={{
                      marginBottom: '8px',
                      borderBottom: '1px solid var(--border-color)',
                      paddingBottom: isExpanded ? '8px' : '0'
                    }}>
                      <div 
                        onClick={() => toggleModuleExpand(mod.id || mIdx)}
                        style={{
                          padding: '12px 0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        <div style={{
                          color: isExpanded ? 'var(--accent-purple)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'transform 0.2s ease'
                        }}>
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </div>
                        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontWeight: isExpanded ? '700' : '500', fontSize: '0.95rem', color: isExpanded ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {mod.module}
                          </span>
                          <div style={{ width: '100%', height: '2px', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                            <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--accent-purple)', transition: 'width 0.3s ease' }}></div>
                          </div>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{completed}/{total}</span>
                      </div>

                      {isExpanded && (
                        <div className="quest-node-container" style={{ padding: '4px 0 8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {mod.subtopics.map(t => {
                            const isTopicActive = activeTopicId === t.id;
                            return (
                              <div
                                key={t.id}
                                onClick={() => handleLoadLesson(t.id, mod.module)}
                                style={{
                                  position: 'relative',
                                  zIndex: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  padding: '8px 12px',
                                  marginLeft: '14px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  background: isTopicActive ? 'rgba(168, 85, 247, 0.08)' : 'transparent',
                                  color: isTopicActive ? 'var(--accent-purple)' : 'var(--text-secondary)',
                                  transition: 'all 0.2s ease'
                                }}
                                className="nav-item-hover"
                              >
                                {t.completed ? (
                                  <CheckCircle size={16} style={{ color: 'var(--accent-green)' }} />
                                ) : (
                                  <Circle size={16} style={{ color: 'currentColor', opacity: 0.5 }} />
                                )}
                                <span style={{
                                  fontSize: '0.85rem',
                                  fontWeight: isTopicActive ? '600' : '400',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}>
                                  {t.title}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Custom Node */}
              <form onSubmit={handleAddCustomTopic} style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <input
                  type="text"
                  placeholder="Custom node topic..."
                  value={customTopicTitle}
                  onChange={(e) => setCustomTopicTitle(e.target.value)}
                  style={{
                    flexGrow: 1,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none',
                    fontSize: '0.85rem'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.85rem'
                  }}
                >
                  <Plus size={14} />
                  Add
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right Column: AI Tutor Lesson Scroll */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', minHeight: '500px' }}>
          {!activeTopic ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexGrow: 1,
              textAlign: 'center',
              color: 'var(--text-muted)',
              padding: '60px 0'
            }}>
              <BookOpen size={64} style={{ marginBottom: '16px', strokeWidth: '1.5', opacity: 0.5 }} />
              <h3>Quest Map Standby</h3>
              <p style={{ maxWidth: '350px', fontSize: '0.9rem', marginTop: '6px' }}>
                Select a learning node on the left to summon your personal AI tutor scroll.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flexGrow: 1 }}>
              
              {/* Lesson Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    fontWeight: '800',
                    color: 'var(--accent-purple)',
                    background: 'var(--bg-tertiary)',
                    padding: '4px 10px',
                    borderRadius: '20px'
                  }}>
                    {activeModuleName || 'Scroll'}
                  </span>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', marginTop: '8px' }}>
                    {activeTopic.title}
                  </h2>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {!activeTopic.completed && (
                    <button
                      onClick={handleMarkAsCompleted}
                      className="glow-btn"
                      style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                    >
                      <CheckCircle size={14} />
                      Completed
                    </button>
                  )}
                  {activeTopic.completed && (
                    <span style={{
                      color: 'var(--accent-green)',
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      🎉 Node Completed
                    </span>
                  )}
                </div>
              </div>

              {/* Lesson scroll text */}
              <div style={{
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-color)',
                boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.2)',
                padding: '32px 40px',
                borderRadius: '16px',
                minHeight: '400px',
                lineHeight: '1.7',
                overflowY: 'auto'
              }}>
                {lessonLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px' }}>
                    <div className="spinner" style={{ width: '40px', height: '40px', marginBottom: '16px' }}></div>
                    <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Tutor writing scroll...</p>
                  </div>
                ) : (
                  <div 
                    className="markdown-body"
                    dangerouslySetInnerHTML={{ __html: marked(lessonContent) }}
                    style={{ fontSize: '0.95rem' }}
                  />
                )}
              </div>

              {/* Q&A Sub-Panel */}
              {lessonContent && !lessonLoading && (
                <div style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HelpCircle size={16} style={{ color: 'var(--accent-pink)' }} />
                    <h4 style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Ask Follow-up Questions</h4>
                  </div>

                  {/* History */}
                  {qaHistory.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '8px' }}>
                      {qaHistory.map((msg, idx) => (
                        <div key={idx} className={`chat-bubble ${msg.role === 'user' ? 'chat-user' : 'chat-ai'}`}>
                          <div style={{
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' : 'var(--accent-cyan)',
                            marginBottom: '6px'
                          }}>
                            {msg.role === 'user' ? 'You' : 'AI Tutor'}
                          </div>
                          <div 
                            className="markdown-body"
                            dangerouslySetInnerHTML={{ __html: marked(msg.text) }} 
                            style={{ fontSize: '0.9rem', color: msg.role === 'user' ? '#fff' : 'inherit' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Input Form */}
                  <form onSubmit={handleAskQuestion} style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Ask the AI Tutor anything about this lesson..."
                      value={qaInput}
                      onChange={(e) => setQaInput(e.target.value)}
                      disabled={qaLoading}
                      style={{
                        flexGrow: 1,
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        outline: 'none',
                        fontSize: '0.9rem'
                      }}
                    />
                    <button
                      type="submit"
                      disabled={qaLoading || !qaInput.trim()}
                      style={{
                        background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '0 16px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: (qaLoading || !qaInput.trim()) ? 0.6 : 1
                      }}
                    >
                      {qaLoading ? 'Thinking...' : 'Ask'}
                      <ArrowRight size={16} />
                    </button>
                  </form>
                </div>
              )}

            </div>
          )}
        </div>

      </div>
      <style dangerouslySetInnerHTML={{__html: `
      .markdown-body {
          color: var(--text-primary);
          font-family: inherit;
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0.3em;
          margin-top: 1.5em;
          margin-bottom: 1em;
        }
        .markdown-body h1 { font-size: 1.8rem; background: linear-gradient(90deg, var(--accent-purple), var(--accent-pink)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; border-bottom: none; }
        .markdown-body h2 { font-size: 1.4rem; color: var(--accent-purple); border-bottom: 1px solid rgba(168, 85, 247, 0.2); }
        .markdown-body h3 { font-size: 1.2rem; color: var(--text-secondary); border: none; }
        .markdown-body p { margin-top: 0; margin-bottom: 16px; line-height: 1.7; }
        .markdown-body a { color: var(--accent-cyan); text-decoration: none; }
        .markdown-body a:hover { text-decoration: underline; }
        .markdown-body blockquote {
          margin: 0 0 16px 0;
          padding: 0 1em;
          color: var(--text-muted);
          border-left: 0.25em solid var(--accent-purple);
          background: rgba(168, 85, 247, 0.05);
          border-radius: 0 8px 8px 0;
          padding-top: 8px;
          padding-bottom: 8px;
        }
        .markdown-body ul, .markdown-body ol { margin-top: 0; margin-bottom: 16px; padding-left: 2em; line-height: 1.7; }
        .markdown-body li { margin-top: 0.25em; }
        .markdown-body code {
          padding: 0.2em 0.4em;
          margin: 0;
          font-size: 85%;
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          font-family: var(--font-mono);
          color: var(--accent-pink);
        }
        .markdown-body pre {
          padding: 16px;
          overflow: auto;
          font-size: 85%;
          line-height: 1.45;
          background-color: #1e1e1e;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
          margin-bottom: 16px;
        }
        .markdown-body pre code {
          background-color: transparent;
          padding: 0;
          border-radius: 0;
          color: #d4d4d4;
        }
        
        .chat-bubble {
          max-width: 85%;
          padding: 14px 18px;
          border-radius: 20px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          line-height: 1.5;
        }
        .chat-user {
          align-self: flex-end;
          background: linear-gradient(135deg, var(--accent-purple), var(--accent-pink));
          color: white;
          border-bottom-right-radius: 4px;
        }
        .chat-ai {
          align-self: flex-start;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          border-bottom-left-radius: 4px;
        }
        
        .quest-node-container {
          position: relative;
        }
        .quest-node-container::before {
          content: '';
          position: absolute;
          top: 15px;
          bottom: 20px;
          left: 19px;
          width: 1px;
          background: rgba(255, 255, 255, 0.1);
          z-index: 0;
        }
      `}} />
    </div>
  );
};

export default LearnSkills;

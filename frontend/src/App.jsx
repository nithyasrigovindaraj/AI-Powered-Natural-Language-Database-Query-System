import { useState, useRef, useEffect } from 'react';
import * as xlsx from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './index.css';

function App() {
  const [dbEngine, setDbEngine] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  
  const defaultMessage = {
    sender: 'bot',
    text: "Hi there! I'm your NoSQL Database Assistant. I can help you create databases (tables/collections) or query your existing data using natural language. How can I help?",
    results: null
  };
  
  const [messages, setMessages] = useState([defaultMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [collections, setCollections] = useState([]);
  const [activeCollection, setActiveCollection] = useState(null);
  const [showGlobalHistory, setShowGlobalHistory] = useState(false);
  
  const [chatSessions, setChatSessions] = useState(() => {
    try {
      const saved = localStorage.getItem('ai_db_sessions');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [currentSessionId, setCurrentSessionId] = useState(() => Date.now().toString());
  
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  // Custom fetch to update collections
  const fetchCollections = async () => {
    try {
      const q = dbEngine ? `?engine=${dbEngine}` : '';
      const res = await fetch(`http://localhost:5000/api/collections${q}`);
      const data = await res.json();
      if (data.collections) {
        setCollections(data.collections);
        // Set first active if none
        if (data.collections.length > 0 && !activeCollection) {
          setActiveCollection(data.collections[0]);
        }
      }
    } catch (err) {
      console.error("Could not fetch collections", err);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, [dbEngine]);

  // Splash Screen Timer
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2400);
    return () => clearTimeout(timer);
  }, []);

  // Web Speech API
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;

  if (recognition) {
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
      handleSend(transcript);
    };
    recognition.onend = () => setIsListening(false);
  }

  const toggleListen = () => {
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else if (recognition) {
      recognition.start();
      setIsListening(true);
    } else {
      alert("Voice not supported.");
    }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    // Save sessions continuously
    if (messages.length > 1) {
      setChatSessions(prev => {
         const idx = prev.findIndex(s => s.id === currentSessionId);
         const sessionTitle = messages[1].text.substring(0, 25) + (messages[1].text.length > 25 ? '...' : '');
         const newSession = { 
            id: currentSessionId, 
            title: sessionTitle, 
            messages: messages,
            engine: dbEngine || 'Database'
         };
         let newSessions = [...prev];
         if (idx !== -1) newSessions[idx] = newSession;
         else newSessions = [newSession, ...newSessions];
         localStorage.setItem('ai_db_sessions', JSON.stringify(newSessions));
         return newSessions;
      });
    }
  }, [messages, isLoading, currentSessionId]);

  const handleSend = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim()) return;

    // Add user message
    setMessages(prev => [...prev, { sender: 'user', text }]);
    setInput('');
    setIsLoading(true);

    // Prepare history for context
    const historyBuf = messages.slice(-6).reduce((acc, curr) => {
        if(curr.sender === 'user') acc.push({ user: curr.text, bot: '' });
        else if(acc.length > 0) acc[acc.length-1].bot = curr.text;
        return acc;
    }, []);

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          naturalQuery: text,
          history: historyBuf,
          activeCollection: activeCollection,
          dbEngine: dbEngine
        })
      });

      const data = await response.json();

      if (data.success) {
        // If DB creation was successful, refresh lists
        if (data.action === 'CREATE_COLLECTION' && data.collections) {
           setCollections(data.collections);
        }

        setMessages(prev => [...prev, {
          sender: 'bot',
          text: data.replyMessage || "Done.",
          query: data.query || null,
          results: data.results || null,
          error: data.dbError
        }]);
      } else {
        setMessages(prev => [...prev, {
          sender: 'bot',
          text: `Error: ${data.error}`
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        sender: 'bot',
        text: 'Connection failed. Is the backend running?'
      }]);
    }
    setIsLoading(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setMessages(prev => [...prev, { sender: 'user', text: `*[System: Uploading File '${file.name}']*` }]);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dbEngine', dbEngine);

    try {
      const res = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.success) {
        setCollections(data.collections);
        setActiveCollection(data.collectionName);
        setMessages(prev => [...prev, { 
          sender: 'bot', 
          text: `Success! Successfully parsed the file and loaded the '${data.collectionName}' NoSQL Database table. You can now use natural language to query it (e.g., "Sort students by marks").` 
        }]);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'bot', text: `Upload failed: ${err.message}` }]);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
    setIsLoading(false);
  };

  const handleCreateDBShortcut = () => {
     handleSend("I would like to create a new database table. What information do you need?");
  };

  const handleNewChat = () => {
     setMessages([defaultMessage]);
     setCurrentSessionId(Date.now().toString());
  };

  const loadSession = (id, engineContext = null) => {
     const session = chatSessions.find(s => s.id === id);
     if (session) {
       if (engineContext) setDbEngine(engineContext);
       setMessages(session.messages);
       setCurrentSessionId(id);
       setShowGlobalHistory(false);
     }
  };

  const handleClearHistory = () => {
     if(window.confirm('Are you sure you want to delete all saved chat history?')) {
        setChatSessions([]);
        localStorage.removeItem('ai_db_sessions');
        handleNewChat();
     }
  };

  const handleActionView = async (col) => {
    setIsLoading(true);
    setMessages(prev => [...prev, { sender: 'user', text: `*[System: View Entire DB '${col}']*` }]);
    try {
      const res = await fetch(`http://localhost:5000/api/collections/${col}/data`);
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, {
          sender: 'bot',
          text: `Here is all the data for '${col}':`,
          results: data.data || []
        }]);
      } else throw new Error(data.error);
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'bot', text: `Failed to fetch data: ${err.message}` }]);
    }
    setIsLoading(false);
  };

  const handleActionDelete = async (col) => {
    if(!window.confirm(`Are you sure you want to completely delete the database '${col}'?`)) return;
    setIsLoading(true);
    setMessages(prev => [...prev, { sender: 'user', text: `*[System: Delete DB '${col}']*` }]);
    try {
      const q = dbEngine ? `?engine=${dbEngine}` : '';
      const res = await fetch(`http://localhost:5000/api/collections/${col}${q}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setCollections(data.collections);
        if (activeCollection === col) setActiveCollection(null);
        setMessages(prev => [...prev, { sender: 'bot', text: `Database '${col}' has been completely removed.` }]);
      } else throw new Error(data.error);
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'bot', text: `Failed to delete database: ${err.message}` }]);
    }
    setIsLoading(false);
  };

  const handleActionEdit = (col) => {
    handleSend(`I would like to edit the database '${col}'. Can you help me modify the data or schema?`);
  };

  const handleExportExcel = (results) => {
    const ws = xlsx.utils.json_to_sheet(results);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Results");
    xlsx.writeFile(wb, "database_export.xlsx");
  };

  const handleExportPDF = (results, keys) => {
    const doc = new jsPDF();
    const tableData = results.map(row => keys.map(k => typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]));
    autoTable(doc, { head: [keys], body: tableData });
    doc.save("database_export.pdf");
  };

  const handleExportDoc = (results, keys) => {
    let docContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export</title></head><body><table border="1" style="border-collapse: collapse; width: 100%;"><thead><tr>`;
    keys.forEach(k => docContent += `<th style="background:#f4f4f5; text-align:left; padding:8px">${k}</th>`);
    docContent += `</tr></thead><tbody>`;
    results.forEach(row => {
       docContent += "<tr>";
       keys.forEach(k => docContent += `<td style="padding:8px">${typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]}</td>`);
       docContent += "</tr>";
    });
    docContent += `</tbody></table></body></html>`;

    const blob = new Blob(['\ufeff', docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'database_export.doc';
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderResultsTable = (results) => {
    if (!results || results.length === 0) return <p style={{marginTop: '10px', color: '#94a3b8', fontSize: '0.85rem'}}>No data found.</p>;
    let keys = [];
    if (typeof results[0] === 'object' && results[0] !== null) {
      keys = Object.keys(results[0]).filter(k => k !== '__v' && k !== '_id');
    }
    if (keys.length === 0) return <pre className="query-box">{JSON.stringify(results, null, 2)}</pre>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="result-table-container">
          <table className="result-table">
            <thead>
              <tr>{keys.map(k => <th key={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</th>)}</tr>
            </thead>
            <tbody>
              {results.map((row, idx) => (
                <tr key={idx}>
                  {keys.map(k => (
                    <td key={k}>{typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="export-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
           <button className="db-action-btn" style={{border: '1px solid var(--surface-border)'}} onClick={() => handleExportExcel(results)}>
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" style={{verticalAlign: 'middle', marginRight: '6px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Export Excel (.xlsx)
           </button>
           <button className="db-action-btn" style={{border: '1px solid var(--surface-border)'}} onClick={() => handleExportPDF(results, keys)}>
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{verticalAlign: 'middle', marginRight: '6px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Export PDF (.pdf)
           </button>
           <button className="db-action-btn" style={{border: '1px solid var(--surface-border)'}} onClick={() => handleExportDoc(results, keys)}>
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{verticalAlign: 'middle', marginRight: '6px'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Export Doc (.doc)
           </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {showSplash && (
        <div className={`splash-screen ${!showSplash ? 'fade-out' : ''}`}>
           <div className="splash-logo">⚡</div>
           <div className="splash-text">INIT_ARCHITECT_KERNEL...</div>
           <div className="splash-loader-bar">
             <div className="splash-loader-progress"></div>
           </div>
        </div>
      )}

      {showGlobalHistory && (
        <div className="modal-overlay">
          <div className="modal-content">
             <div className="modal-header">
               <h2>Global History</h2>
               <button className="close-btn" onClick={() => setShowGlobalHistory(false)}>✕</button>
             </div>
             <div className="modal-body">
                {chatSessions.length === 0 ? (
                  <p style={{color: 'var(--text-muted)'}}>No history found across any databases.</p>
                ) : (
                  <div className="global-history-list">
                    {chatSessions.map(session => (
                      <div key={session.id} className="global-history-item" onClick={() => loadSession(session.id, session.engine)}>
                         <div className="session-icon">💬</div>
                         <div className="session-details">
                            <h4>{session.title.replace(/\*\[System.*?\]\*\s*/g, '')}</h4>
                            <span className="engine-badge">{session.engine || 'General'}</span>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
             <div className="modal-footer">
               <button className="del-btn" onClick={handleClearHistory}>Clear All History</button>
             </div>
          </div>
        </div>
      )}

      {!dbEngine ? (
        <div className="landing-page">
           <div className="landing-navbar">
              <div className="brand"><span className="brand-icon">⚡</span> Nexus Database Command</div>
              <div className="dropdown">
                 <button className="three-dots-btn" title="Menu">⋮</button>
                 <div className="dropdown-menu">
                    <button onClick={() => setShowGlobalHistory(true)}>Global Session History</button>
                 </div>
              </div>
           </div>
           
           <h1 className="landing-title">Architecture Engine Selection</h1>
           <p className="landing-subtitle">Speak human. Execute native. The universal AI gateway to instantly translate your words into raw database logic.</p>
           <div className="db-grid">
               {[
                 { id: 'MongoDB',  icon: '🍃', desc: 'Document Database Platform' },
                 { id: 'DynamoDB', icon: '⚡', desc: 'AWS Key-Value & Document DB' },
                 { id: 'Cassandra',icon: '👁️', desc: 'Wide Column Store' },
                 { id: 'CouchDB',  icon: '🛋️', desc: 'JSON Document Store' }
               ].map(db => (
                 <div key={db.id} className="db-card" onClick={() => setDbEngine(db.id)}>
                    <div className="db-card-content">
                       <div className="db-card-icon">{db.icon}</div>
                       <h3>{db.id}</h3>
                       <p>{db.desc}</p>
                    </div>
                 </div>
               ))}
           </div>
        </div>
      ) : (
      <>
        <nav className="navbar">
           <div className="brand">
              <span className="brand-icon">⚡</span>
              Nexus Database Command
           </div>
           <div className="nav-actions">
              <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>Active Bridge: <span style={{color: '#fff', fontWeight: '500'}}>{dbEngine}</span></div>
              <button className="nav-btn" onClick={() => { setDbEngine(null); handleNewChat(); }} style={{border: '1px solid #3b82f6', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)'}}>
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '4px'}}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                 Home (Leave DB)
              </button>
           </div>
        </nav>

        <div className="app-wrapper">
          {/* Sidebar */}
          <aside className="sidebar">
            <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileUpload}
              />
            
            <div className="sidebar-section">
              <div className="sidebar-section-title">Schema Tables</div>
            </div>
            
            <div className="collections-list">
               {collections.length === 0 ? (
                 <div style={{padding: '0 24px', color: '#64748b', fontSize: '0.85rem'}}>No databases left.</div>
               ) : (
                  collections.map(col => (
                    <div key={col}>
                      <div 
                        className={`collection-item ${activeCollection === col ? 'active' : ''}`}
                        onClick={() => setActiveCollection(activeCollection === col ? null : col)}
                      >
                        {col}
                      </div>
                      {activeCollection === col && (
                        <div className="db-actions">
                           <button className="db-action-btn" onClick={() => handleActionView(col)}>
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign: 'middle', marginRight: '6px'}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> View Entire DB
                           </button>
                           <button className="db-action-btn" onClick={() => handleActionEdit(col)}>
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign: 'middle', marginRight: '6px'}}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit DB
                           </button>
                           <button className="db-action-btn delete" onClick={() => handleActionDelete(col)}>
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign: 'middle', marginRight: '6px'}}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Delete DB
                           </button>
                        </div>
                      )}
                    </div>
                  ))
               )}
            </div>

            <div className="sidebar-section">
               <div className="sidebar-section-title">Query Logs</div>
               {chatSessions.length > 0 && (
                 <button 
                   onClick={handleClearHistory}
                   style={{background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.70rem', textTransform: 'none'}}
                   title="Clear All History"
                 >
                   Clear All
                 </button>
               )}
            </div>

            <div className="chat-history-list" style={{ flex: 1, overflowY: 'auto' }}>
              {chatSessions.filter(s => s.engine === dbEngine).length === 0 ? (
                 <div style={{padding: '0 24px', color: '#64748b', fontSize: '0.85rem'}}>No previous logs for {dbEngine}.</div>
              ) : (
                 chatSessions.filter(s => s.engine === dbEngine).map(session => (
                   <div 
                     key={session.id} 
                     className={`collection-item ${currentSessionId === session.id ? 'active' : ''}`}
                     onClick={() => loadSession(session.id)}
                     style={{ fontSize: '0.85rem' }}
                   >
                     💬 {session.title.replace(/\*\[System.*?\]\*\s*/g, '')}
                   </div>
                 ))
              )}
            </div>

            <button className="create-db-btn" onClick={handleCreateDBShortcut}>
              + Create New DB Table
            </button>
            <button className="create-db-btn" style={{marginTop: 0, background: 'transparent', border: '1px solid var(--surface-border)'}} onClick={handleNewChat}>
              New Query Log
            </button>

          </aside>

          {/* Main Workspace Interface */}
          <main className="main-content">
            <div className="chat-body">
              {messages.map((msg, index) => (
                <div key={index} className={`log-block ${msg.sender}`}>
                  <div className="log-header">
                    {msg.sender === 'user' ? 'USER_QUERY' : 'SYSTEM_RESPONSE'}
                  </div>
                  <div className="log-content">
                    {msg.text.split('\n').map((line, i) => (
                      <span key={i}>{line}<br /></span>
                    ))}
                    {msg.error && (
                      <div style={{color: '#ef4444', marginTop: '8px', fontSize: '0.85rem'}}>
                        Failed: {msg.error}
                      </div>
                    )}
                    {msg.query && (
                      <div className="query-box">
                        {"// Generated Native NoSQL Query:"}<br/>
                        {msg.query}
                      </div>
                    )}
                    {msg.results && renderResultsTable(msg.results)}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="log-block bot">
                   <div className="log-header">SYSTEM_EXECUTING</div>
                   <div className="typing">Running translation and extraction sequence...</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="input-area">
               <div className="input-container">
                  <button className="action-btn" onClick={() => fileInputRef.current && fileInputRef.current.click()} title="Upload CSV / XLSX">
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                  </button>
                  <button className={`action-btn ${isListening ? 'listening' : ''}`} onClick={toggleListen} title="Voice Input">
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                  </button>
                  <textarea 
                    className="chat-input" 
                    placeholder="Write an NLP query (e.g., 'Find users where age > 20') or upload a file. Shift+Enter for new line."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                       if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                       }
                    }}
                    disabled={isLoading}
                  />
                  <button className="send-btn" onClick={() => handleSend()}>
                    Execute
                  </button>
               </div>
            </div>
          </main>
        </div>
      </>
      )}
    </>
  );
}

export default App;

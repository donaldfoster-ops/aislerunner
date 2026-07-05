"use client";
import { useState } from 'react';
import { claude } from '@/lib/api';

export default function ChatTab({ reportData }: { reportData?: any }) {
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([
    { role: 'assistant', content: "Hello! I'm your Mazonkiki AI store assistant. I can help you analyze your store data, write product descriptions, or explain any SEO/theme issues. How can I help today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const data = await claude({
        messages: newMessages.filter(m => m.role === 'user' || m.role === 'assistant'),
        model: 'claude-sonnet-4-6',
        system: "You are the AI store assistant for Mazonkiki, a luxury fashion store. Be helpful, concise, and professional."
      });
      
      setMessages([...newMessages, { role: 'assistant', content: data.text }]);
    } catch (e: any) {
      setMessages([...newMessages, { role: 'assistant', content: `❌ Error: ${e.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-layout">
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {isLoading && <div className="chat-bubble assistant">Thinking...</div>}
      </div>
      <div className="chat-input-area">
        <textarea 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything..."
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
        />
        <button className="btn btn-primary" onClick={sendMessage} disabled={isLoading}>
          ➤
        </button>
      </div>
    </div>
  );
}

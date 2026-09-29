import { useState, useRef, useEffect } from "react";
import { Search, Send, User, Loader2, AlertCircle, FileText } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function SLPAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestedQuestions = [
    "Do I have any patient connection requests?",
    "Which patients need review?",
    "Who hasn't practiced this week?",
    "Show recent sessions."
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/slp/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ message: text }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.text,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error(err);
      setError("Assistant is temporarily unavailable.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] max-h-screen flex flex-col bg-white">
      <div className="flex-none px-8 py-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clinical Assistant</h1>
          <p className="text-sm text-slate-500 mt-1">Query patient data and session history.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="mt-12 space-y-8">
              <div className="space-y-2">
                <h2 className="text-lg font-medium text-slate-900">Suggested Queries</h2>
                <p className="text-slate-500 text-sm">Select a query or type your own below.</p>
              </div>
              <div className="flex flex-col gap-2 items-start">
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-md text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Search className="w-4 h-4 text-slate-400" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-4 ${msg.role === "assistant" ? "" : "flex-row-reverse"}`}
            >
              <div
                className={`flex-none w-8 h-8 rounded-sm flex items-center justify-center border ${
                  msg.role === "assistant"
                    ? "bg-slate-50 border-slate-200 text-slate-700"
                    : "bg-indigo-50 border-indigo-100 text-indigo-700"
                }`}
              >
                {msg.role === "assistant" ? <FileText className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div
                className={`flex-1 px-4 py-3 rounded-md max-w-[85%] text-sm ${
                  msg.role === "assistant"
                    ? "bg-white border border-slate-200 text-slate-800"
                    : "bg-indigo-600 border border-indigo-600 text-white"
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4">
              <div className="flex-none w-8 h-8 rounded-sm bg-slate-50 border border-slate-200 text-slate-700 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-white border border-slate-200 rounded-md px-4 py-3 text-sm text-slate-500">
                Searching records...
              </div>
            </div>
          )}
          
          {error && (
            <div className="flex gap-4">
              <div className="flex-none w-8 h-8 rounded-sm bg-red-50 border border-red-200 text-red-600 flex items-center justify-center">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
                {error}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="flex-none p-6 border-t border-slate-200 bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="max-w-3xl mx-auto relative"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Type your query..."
            className="w-full pl-4 pr-12 py-3 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useChat } from '../contexts/ChatContext';
import { useWorkspace } from '../contexts/WorkspaceContext';

export default function SettingsPanel() {
  const { sessionId, fetchActiveModelConfig } = useChat();
  const { setActiveDrawer } = useWorkspace();

  const [providers, setProviders] = useState<any[]>([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [selectedModelProvider, setSelectedModelProvider] = useState<string>('anthropic');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [tempThinkingLevel, setTempThinkingLevel] = useState<string>('off');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchModelConfig = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`http://localhost:3000/api/models?sessionId=${sessionId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const nextProviders = data.providers || [];
      const nextModels = data.models || [];
      setProviders(nextProviders);
      setAvailableModels(nextModels);
      
      // Initialize selected dropdowns
      const nextProvider =
        data.activeProvider ||
        (nextProviders.some((p: any) => p.id === selectedModelProvider) ? selectedModelProvider : nextProviders[0]?.id) ||
        '';
      const nextModel =
        (data.activeModel && nextModels.some((m: any) => m.provider === nextProvider && m.id === data.activeModel))
          ? data.activeModel
          : (nextModels.find((m: any) => m.provider === nextProvider)?.id || '');
      setSelectedModelProvider(nextProvider);
      setSelectedModelId(nextModel);
      if (data.thinkingLevel) setTempThinkingLevel(data.thinkingLevel);

      // Initialize API Keys and Base URLs from backend
      const keys: Record<string, string> = {};
      const urls: Record<string, string> = {};
      const visible: Record<string, boolean> = {};
      
      if (data.providers) {
        data.providers.forEach((p: any) => {
          keys[p.id] = p.configured ? '********' : '';
          urls[p.id] = p.baseUrl || '';
          visible[p.id] = false;
        });
      }
      setApiKeys(keys);
      setBaseUrls(urls);
      setShowKeys(visible);
    } catch (err) {
      console.error('Failed to fetch models config:', err);
      setProviders([]);
      setAvailableModels([]);
      setLoadError('无法连接后端模型服务，请确认 localhost:3000 已启动，或查看后端启动日志。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchModelConfig();
  }, [sessionId]);

  const handleDeepSeekAutoFill = () => {
    setBaseUrls(prev => ({ ...prev, deepseek: 'https://api.deepseek.com' }));
  };

  const handleQwenAutoFill = () => {
    setBaseUrls(prev => ({ ...prev, qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }));
  };

  const handleApiKeyChange = (provider: string, val: string) => {
    setApiKeys(prev => ({ ...prev, [provider]: val }));
  };

  const handleBaseUrlChange = (provider: string, val: string) => {
    setBaseUrls(prev => ({ ...prev, [provider]: val }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loadError) {
      alert(loadError);
      return;
    }
    if (!selectedModelProvider) {
      alert('请先选择模型服务商。');
      return;
    }
    if (!selectedModelId) {
      alert('请先选择智能体模型。');
      return;
    }
    setIsSaving(true);
    try {
      // Save keys and baseUrls for each provider
      for (const p of providers) {
        const keyInput = apiKeys[p.id];
        let keyToSend: string | undefined = undefined;
        if (keyInput !== '********') {
          keyToSend = keyInput;
        }
        
        const urlInput = baseUrls[p.id];
        const isDeepSeek = p.id === 'deepseek';
        const isQwen = p.id === 'qwen';
        
        const keyEdited = keyInput !== '********';
        const prevProvider = providers.find(prov => prov.id === p.id);
        const urlEdited = urlInput !== (prevProvider?.baseUrl || '');
        
        if (keyEdited || urlEdited || (isDeepSeek && urlInput) || (isQwen && urlInput)) {
          const payload: any = {
            provider: p.id,
            apiKey: keyToSend,
            baseUrl: urlInput || undefined
          };
          
          if (isDeepSeek) {
            payload.api = 'openai-completions';
            payload.models = [
              {
                id: 'deepseek-v4-pro',
                name: 'DeepSeek V4 Pro',
                reasoning: true,
                input: ['text'],
                contextWindow: 1000000,
                maxTokens: 384000
              },
              {
                id: 'deepseek-v4-flash',
                name: 'DeepSeek V4 Flash',
                reasoning: false,
                input: ['text'],
                contextWindow: 1000000,
                maxTokens: 384000
              }
            ];
          }

          if (isQwen) {
            payload.api = 'openai-completions';
            payload.models = [
              {
                id: 'qwen3.6-plus',
                name: 'Qwen3.6 Plus',
                reasoning: true,
                input: ['text', 'image'],
                contextWindow: 1000000,
                maxTokens: 8192
              },
              {
                id: 'qwen-max-latest',
                name: 'Qwen Max (Latest)',
                reasoning: true,
                input: ['text'],
                contextWindow: 32768,
                maxTokens: 8192
              },
              {
                id: 'qwen-plus-latest',
                name: 'Qwen Plus (Latest)',
                reasoning: false,
                input: ['text', 'image'],
                contextWindow: 131072,
                maxTokens: 8192
              },
              {
                id: 'qwen-flash',
                name: 'Qwen Flash',
                reasoning: false,
                input: ['text'],
                contextWindow: 131072,
                maxTokens: 8192
              },
              {
                id: 'qwen3.6-flash-2026-04-16',
                name: 'Qwen3.6 Flash (2026-04-16)',
                reasoning: false,
                input: ['text', 'image'],
                contextWindow: 1000000,
                maxTokens: 8192
              },
              {
                id: 'qwen3.6-35b-a3b',
                name: 'Qwen3.6 35B A3B',
                reasoning: false,
                input: ['text', 'image'],
                contextWindow: 1000000,
                maxTokens: 8192
              }
            ];
          }
          
          await fetch('http://localhost:3000/api/models/configure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
      }

      // Select the active model & thinking level for the active session
      const selectResponse = await fetch('http://localhost:3000/api/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedModelProvider,
          modelId: selectedModelId,
          thinkingLevel: tempThinkingLevel,
          sessionId
        })
      });
      const selectData = await selectResponse.json();

      if (selectData.success) {
        await fetchActiveModelConfig();
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#00f2fe', '#daff3c', '#ff007f']
        });
        setActiveDrawer(null);
      } else {
        alert(`Error selecting model: ${selectData.error}`);
      }
    } catch (err: any) {
      alert(`保存配置失败: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        加载模型配置中...
      </div>
    );
  }

  const selectedProviderModels = availableModels.filter(m => m.provider === selectedModelProvider);
  const canSave = !loadError && providers.length > 0 && !!selectedModelProvider && !!selectedModelId && !isSaving;

  return (
    <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {loadError && (
        <div style={{ border: '2px solid #ff007f', padding: '12px', backgroundColor: '#120008', color: '#ffffff', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.6 }}>
          {loadError}
        </div>
      )}
      
      {/* Active Model Select */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: '2px solid #222222', padding: '16px', backgroundColor: '#000000' }}>
        <h3 style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: 900, textTransform: 'uppercase', color: 'var(--secondary)', marginBottom: '4px' }}>
          模型激活选择
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>模型服务商 (Provider)</label>
          <select
            value={selectedModelProvider}
            onChange={(e) => {
              const prov = e.target.value;
              setSelectedModelProvider(prov);
              const firstMod = availableModels.find(m => m.provider === prov);
              setSelectedModelId(firstMod?.id || '');
            }}
            className="input-premium"
            disabled={!!loadError || providers.length === 0}
            style={{ width: '100%', cursor: loadError || providers.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            {providers.length === 0 && (
              <option value="">未加载到模型服务商</option>
            )}
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name} {p.configured ? '✓' : '(未配置)'}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>智能体模型 (Model)</label>
          <select
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="input-premium"
            disabled={!!loadError || !selectedModelProvider || selectedProviderModels.length === 0}
            style={{ width: '100%', cursor: loadError || !selectedModelProvider || selectedProviderModels.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            {selectedProviderModels
              .map(m => (
                <option key={m.id} value={m.id}>{m.name} {m.reasoning ? '(Reasoning)' : ''}</option>
              ))
            }
            {selectedProviderModels.length === 0 && (
              <option value="">(请先在该 Provider 下添加模型)</option>
            )}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>思考深度 (Thinking Level)</label>
          <select
            value={tempThinkingLevel}
            onChange={(e) => setTempThinkingLevel(e.target.value)}
            className="input-premium"
            disabled={!!loadError}
            style={{ width: '100%', cursor: loadError ? 'not-allowed' : 'pointer' }}
          >
            <option value="off">Off (关闭思考，常规响应)</option>
            <option value="minimal">Minimal (极简思考)</option>
            <option value="low">Low (低度思考)</option>
            <option value="medium">Medium (中度思考)</option>
            <option value="high">High (深度思考)</option>
            <option value="xhigh">X-High (极限深度思考)</option>
          </select>
        </div>
      </div>

      {/* Provider Details Configuration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: 900, textTransform: 'uppercase', color: 'var(--primary)' }}>
          服务商凭证配置
        </h3>

        {providers.map(p => (
          <div 
            key={p.id} 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px', 
              padding: '16px', 
              background: '#000000', 
              border: '2px solid #222222' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#ffffff' }}>
                {p.name.toUpperCase()}
              </span>
              {p.id === 'deepseek' && (
                <button 
                  type="button"
                  onClick={handleDeepSeekAutoFill}
                  className="btn-premium btn-secondary"
                  style={{ fontSize: '10px', padding: '4px 8px', boxShadow: 'none' }}
                >
                  填官方参数
                </button>
              )}
              {p.id === 'qwen' && (
                <button 
                  type="button"
                  onClick={handleQwenAutoFill}
                  className="btn-premium btn-secondary"
                  style={{ fontSize: '10px', padding: '4px 8px', boxShadow: 'none' }}
                >
                  填官方参数
                </button>
              )}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>API Key</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showKeys[p.id] ? 'text' : 'password'}
                    value={apiKeys[p.id] || ''}
                    onChange={(e) => handleApiKeyChange(p.id, e.target.value)}
                    placeholder={p.configured ? '已配置 (输入新 Key 覆盖)' : '请输入 API Key'}
                    className="input-premium"
                    style={{ width: '100%', paddingRight: '40px', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeys(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                    style={{ 
                      position: 'absolute', 
                      right: '10px', 
                      background: 'transparent', 
                      border: 'none', 
                      color: 'var(--text-muted)', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {showKeys[p.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Base URL (端点)</label>
                <input
                  type="text"
                  value={baseUrls[p.id] || ''}
                  onChange={(e) => handleBaseUrlChange(p.id, e.target.value)}
                  placeholder="默认: 官方默认端点"
                  className="input-premium"
                  style={{ width: '100%', fontSize: '12px' }}
                />
              </div>
            </div>
          </div>
        ))}
        {providers.length === 0 && (
          <div style={{ border: '2px solid #222222', padding: '16px', backgroundColor: '#000000', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            暂无可配置的模型服务商。
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '12px', 
          borderTop: '2px solid #222222', 
          paddingTop: '20px', 
          marginTop: '10px' 
        }}
      >
        <button
          type="button"
          onClick={() => setActiveDrawer(null)}
          className="btn-premium btn-secondary"
          style={{ padding: '10px 20px' }}
        >
          取消
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="btn-premium"
          style={{ padding: '10px 20px', cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.55 }}
        >
          {isSaving ? '保存中...' : '保存并生效'}
        </button>
      </div>

    </form>
  );
}

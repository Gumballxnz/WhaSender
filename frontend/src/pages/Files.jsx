import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Trash2, CheckCircle2, Loader2, Info, AlertTriangle, HardDrive, Download, Archive } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Files() {
  const [files, setFiles] = useState([]);
  const [vpsFiles, setVpsFiles] = useState([]);
  const [vpsLimit, setVpsLimit] = useState({ maxSize: '...', maxFiles: 0 });
  const [uploading, setUploading] = useState(false);
  const [percentage, setPercentage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState({ show: false, type: '', data: null });
  const [downloadingZip, setDownloadingZip] = useState(false);

  useEffect(() => {
    loadVpsFiles();
    loadVpsLimit();
  }, []);

  const loadVpsFiles = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/files');
      setVpsFiles(data.files || []);
    } catch (err) {
      toast.error('Erro ao listar arquivos na VPS');
    } finally {
      setLoading(false);
    }
  };

  const loadVpsLimit = async () => {
    try {
      const { data } = await api.get('/files/limit');
      setVpsLimit(data);
    } catch (err) {
      console.error('Erro ao carregar limite');
    }
  };

  const totalSizeMB = (files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2);
  const isOverLimit = parseFloat(totalSizeMB) > parseFloat(vpsLimit.maxSize);

  const onDrop = useCallback(accepted => {
    const xlsx = accepted.filter(f => f.name.endsWith('.xlsx'));
    if (xlsx.length < accepted.length) {
      toast.error('Apenas arquivos .xlsx são aceitos');
    }
    setFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name));
      const newFiles = xlsx.filter(f => !existingNames.has(f.name));
      return [...prev, ...newFiles];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: true,
    maxFiles: 200,
  });

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setPercentage(0);

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    try {
      const { data } = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setPercentage(percentCompleted);
        }
      });
      toast.success(`${data.count} arquivos enviados com sucesso!`);
      setFiles([]);
      loadVpsFiles();
    } catch (err) {
      toast.error('Erro no upload: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
      setPercentage(0);
    }
  };

  const handleRemoveSelection = (name) => {
    setFiles(prev => prev.filter(f => f.name !== name));
  };

  const confirmDeleteFile = (name) => {
    setShowConfirm({ show: true, type: 'single', data: name });
  };

  const confirmClearAll = () => {
    setShowConfirm({ show: true, type: 'all', data: null });
  };

  const handleConfirmedAction = async () => {
    const { type, data } = showConfirm;
    setShowConfirm({ show: false, type: '', data: null });

    try {
      if (type === 'single') {
        await api.delete(`/files/${data}`);
        toast.success('Arquivo removido');
      } else if (type === 'all') {
        await api.delete('/files/all');
        toast.success('Pasta limpa com sucesso');
      }
      loadVpsFiles();
    } catch (err) {
      toast.error('Erro ao processar ação');
    }
  };

  const handleDownload = async (filename) => {
    try {
      const response = await api.get(`/files/download/${filename}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Download iniciado');
    } catch (err) {
      toast.error('Erro ao baixar arquivo');
    }
  };

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      const response = await api.get('/files/download-zip', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `whasender_leads_${Date.now()}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Download ZIP iniciado!');
    } catch (err) {
      toast.error('Erro ao baixar ZIP: ' + (err.response?.data?.error || err.message));
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Gerenciamento de Arquivos</h2>
        <p>Upload de planilhas .xlsx para disparo</p>
      </div>

      <div className="card-grid">
        {/* Upload Zone */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Upload de Ficheiros</span>
            <div className="card-icon green"><Upload size={20} /></div>
          </div>

          <div
            {...getRootProps()}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: '12px',
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: isDragActive ? 'rgba(37, 211, 102, 0.05)' : 'transparent',
              borderColor: isDragActive ? 'var(--accent)' : 'var(--border)',
              marginTop: '10px'
            }}
          >
            <input {...getInputProps()} />
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>📂</div>
            {isDragActive ? (
              <p style={{ color: 'var(--accent)', fontWeight: 600 }}>Solte os arquivos agora...</p>
            ) : (
              <div>
                <p style={{ fontSize: '16px', fontWeight: 500 }}>Arraste os arquivos .xlsx aqui</p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '5px' }}>Ou clique para selecionar manualmente</p>
              </div>
            )}
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: '20px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{files.length} arquivos selecionados</span>
                <button onClick={() => setFiles([])} className="mono" style={{ color: 'var(--danger)', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}>Remover Todos</button>
              </div>

              <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {files.map(f => (
                  <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileText size={14} color="var(--accent)" />
                      <span className="mono">{f.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{(f.size / 1024).toFixed(1)} KB</span>
                      <button onClick={(e) => { e.stopPropagation(); handleRemoveSelection(f.name); }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tamanho Total</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: isOverLimit ? 'var(--danger)' : 'var(--accent)' }}>{totalSizeMB} MB</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Limite da VPS</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-primary)', fontWeight: 600 }}>
                    <HardDrive size={14} />
                    <span>{vpsLimit.maxSize}</span>
                  </div>
                </div>
              </div>

              {isOverLimit && (
                <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <AlertTriangle size={18} color="var(--danger)" />
                  <p style={{ fontSize: '12px', color: 'var(--danger)', lineHeight: 1.4 }}>
                    O tamanho total excede o limite permitido pela VPS ({vpsLimit.maxSize}). Remova alguns arquivos.
                  </p>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={uploading || isOverLimit}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '12px',
                  opacity: isOverLimit ? 0.5 : 1,
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {uploading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Loader2 size={18} className="spin" />
                      <span>Enviando... {percentage}%</span>
                    </div>
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      height: '4px',
                      backgroundColor: 'rgba(255,255,255,0.3)',
                      width: `${percentage}%`,
                      transition: 'width 0.2s ease-out'
                    }} />
                  </div>
                ) : (
                  <><CheckCircle2 size={18} /> Enviar {files.length} arquivos para a VPS</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* VPS Files List */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Ficheiros na VPS</span>
            <div className="card-icon blue"><FileText size={20} /></div>
          </div>

          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="mono" style={{ fontSize: '20px', fontWeight: 600 }}>{vpsFiles.length}</span>
                <span className="card-label">ficheiros</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {vpsFiles.length > 0 && (
                  <>
                    <button onClick={handleDownloadZip} disabled={downloadingZip} className="btn" style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--info)' }}>
                      {downloadingZip ? <><Loader2 size={14} className="spin" /> ZIP...</> : <><Archive size={14} /> Baixar ZIP</>}
                    </button>
                    <button onClick={confirmClearAll} className="btn" style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>
                      <Trash2 size={14} /> Limpar Pasta
                    </button>
                  </>
                )}
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}><Loader2 className="spin" style={{ color: 'var(--text-muted)' }} /></div>
            ) : vpsFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                <Info size={30} style={{ marginBottom: '10px', opacity: 0.3 }} />
                <p style={{ fontSize: '14px' }}>Nenhum arquivo na pasta</p>
              </div>
            ) : (
              <div className="table-container" style={{ border: 'none', background: 'none', padding: 0 }}>
                <table style={{ fontSize: '13px', tableLayout: 'fixed', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Arquivo</th>
                      <th style={{ textAlign: 'right', width: '80px', minWidth: '80px' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vpsFiles.map(f => (
                      <tr key={f.name}>
                        <td className="mono" style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'left' }} title={f.name}>
                          {f.name}
                        </td>
                        <td style={{ textAlign: 'right', width: '80px', minWidth: '80px' }}>
                          <div style={{ display: 'inline-flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'nowrap' }}>
                            <button onClick={() => handleDownload(f.name)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '6px', display: 'inline-flex' }} title="Baixar planilha">
                              <Download size={15} />
                            </button>
                            <button onClick={() => confirmDeleteFile(f.name)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '6px', display: 'inline-flex' }} title="Excluir planilha">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {showConfirm.show && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', color: 'var(--text-primary)' }}>
              <AlertTriangle color="var(--error)" size={22} />
              Confirmar Exclusão
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5, fontSize: '14px' }}>
              {showConfirm.type === 'single'
                ? `Tem certeza que deseja apagar o arquivo "${showConfirm.data}"?`
                : 'Tem certeza que deseja apagar TODOS os arquivos da pasta na VPS? Esta ação não pode ser desfeita.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                onClick={() => setShowConfirm({ show: false, type: '', data: null })}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={handleConfirmedAction}
              >
                Sim, Apagar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.8); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .modal-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; padding: 24px; width: 100%; max-width: 400px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
          animation: modalIn 0.2s ease-out;
        }
        @keyframes modalIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

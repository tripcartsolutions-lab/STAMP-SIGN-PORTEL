import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, PointerEvent } from 'react'
import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { Download, FileCheck2, FileUp, ImagePlus, Minus, MousePointer2, Plus, RotateCcw, ShieldCheck, Stamp, Trash2, UploadCloud } from 'lucide-react'
import { Check } from 'lucide-react'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type AssetKind = 'signature' | 'stamp'
type Placement = { id: number; kind: AssetKind; src: string; name: string; x: number; y: number; width: number }
type SavedAsset = { src: string; name: string }

function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 })
  const [placements, setPlacements] = useState<Placement[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [savedSignature, setSavedSignature] = useState<SavedAsset | null>(() => { const value = localStorage.getItem('signly-signature'); return value ? JSON.parse(value) as SavedAsset : null })
  const [savedStamp, setSavedStamp] = useState<SavedAsset | null>(() => { const value = localStorage.getItem('signly-stamp'); return value ? JSON.parse(value) as SavedAsset : null })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const signatureInputRef = useRef<HTMLInputElement>(null)
  const stampInputRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const loadPdf = async (file: File) => {
    if (file.type !== 'application/pdf') return
    setPdfFile(file)
    const pdfDocument = await PDFDocument.load(await file.arrayBuffer())
    const page = pdfDocument.getPage(0)
    setPageSize({ width: page.getWidth(), height: page.getHeight() })
    setPlacements([])
    setSelectedId(null)
  }
  const handlePdfChange = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void loadPdf(file) }
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDraggingOver(false); const file = event.dataTransfer.files[0]; if (file) void loadPdf(file) }
  useEffect(() => {
    if (!pdfFile || !canvasRef.current) return
    let cancelled = false
    const renderPage = async () => {
      const loadingTask = pdfjsLib.getDocument({ data: await pdfFile.arrayBuffer() })
      const pdf = await loadingTask.promise
      const page = await pdf.getPage(1)
      if (cancelled || !canvasRef.current) return
      const viewport = page.getViewport({ scale: 2 })
      const canvas = canvasRef.current
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, canvasContext: canvas.getContext('2d') as CanvasRenderingContext2D, viewport }).promise
    }
    void renderPage()
    return () => { cancelled = true }
  }, [pdfFile])
  const addAsset = (event: ChangeEvent<HTMLInputElement>, kind: AssetKind) => {
    const file = event.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => { const saved = { src: String(reader.result), name: file.name }; localStorage.setItem(kind === 'signature' ? 'signly-signature' : 'signly-stamp', JSON.stringify(saved)); if (kind === 'signature') setSavedSignature(saved); else setSavedStamp(saved); addSavedAsset(saved, kind) }
    reader.readAsDataURL(file); event.target.value = ''
  }
  const addSavedAsset = (saved: SavedAsset, kind: AssetKind) => { const item: Placement = { id: Date.now(), kind, src: saved.src, name: saved.name, x: kind === 'signature' ? 56 : 68, y: kind === 'signature' ? 74 : 10, width: kind === 'signature' ? 25 : 18 }; setPlacements((current) => [...current, item]); setSelectedId(item.id) }
  const updateSelected = (changes: Partial<Placement>) => { setPlacements((current) => current.map((item) => item.id === selectedId ? { ...item, ...changes } : item)) }
  const adjustSelectedSize = (amount: number) => { if (selected) updateSelected({ width: Math.max(5, Math.min(70, selected.width + amount)) }) }
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>, id: number) => {
    event.preventDefault(); event.stopPropagation(); setSelectedId(id)
    const page = pageRef.current; const start = placements.find((item) => item.id === id)
    if (!page || !start) return
    const rect = page.getBoundingClientRect(); const startX = event.clientX; const startY = event.clientY
    const move = (moveEvent: globalThis.PointerEvent) => { const nextX = Math.max(1, Math.min(99 - start.width, start.x + ((moveEvent.clientX - startX) / rect.width) * 100)); const nextY = Math.max(1, Math.min(98 - start.width * 0.55, start.y + ((moveEvent.clientY - startY) / rect.height) * 100)); setPlacements((current) => current.map((item) => item.id === id ? { ...item, x: nextX, y: nextY } : item)) }
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
  }
  const handleResizeDown = (event: PointerEvent<HTMLSpanElement>, id: number) => {
    event.preventDefault(); event.stopPropagation(); setSelectedId(id)
    const page = pageRef.current; const start = placements.find((item) => item.id === id)
    if (!page || !start) return
    const rect = page.getBoundingClientRect(); const startX = event.clientX
    const move = (moveEvent: globalThis.PointerEvent) => { const nextWidth = Math.max(5, Math.min(70, start.width + ((moveEvent.clientX - startX) / rect.width) * 100)); setPlacements((current) => current.map((item) => item.id === id ? { ...item, width: nextWidth } : item)) }
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
  }
  const exportPdf = async () => {
    if (!pdfFile) return
    setIsExporting(true)
    const pdfDocument = await PDFDocument.load(await pdfFile.arrayBuffer()); const page = pdfDocument.getPage(0)
    for (const placement of placements) { const imageBytes = await fetch(placement.src).then((response) => response.arrayBuffer()); const image = placement.src.includes('image/png') ? await pdfDocument.embedPng(imageBytes) : await pdfDocument.embedJpg(imageBytes); const width = placement.width / 100 * page.getWidth(); const height = width * image.height / image.width; page.drawImage(image, { x: placement.x / 100 * page.getWidth(), y: page.getHeight() - placement.y / 100 * page.getHeight() - height, width, height }) }
    const bytes = await pdfDocument.save(); const downloadUrl = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })); const link = document.createElement('a'); link.href = downloadUrl; link.download = `${pdfFile.name.replace(/\.pdf$/i, '')}-signed.pdf`; link.click(); URL.revokeObjectURL(downloadUrl); setIsExporting(false)
  }
  const selected = placements.find((item) => item.id === selectedId)

  return (
    <main className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark"><FileCheck2 size={18} /></span><span>Signly</span><span className="brand-dot">/</span><span className="brand-sub">PDF workspace</span></div><div className="secure-note"><ShieldCheck size={15} /> Files stay on your device</div></header>
      <section className="intro"><div><p className="eyebrow">DOCUMENT TOOLS <span>•</span> 01</p><h1>Make it official.</h1><p className="intro-copy">Drop in a PDF, place your signature or stamp exactly where it belongs, then export a ready-to-send document.</p></div><div className="step-track"><span className="step active">01 <small>Upload</small></span><i /><span className={`step ${pdfFile ? 'active' : ''}`}>02 <small>Place</small></span><i /><span className={`step ${placements.length ? 'active' : ''}`}>03 <small>Export</small></span></div></section>
      <section className="workspace">
        <aside className="sidebar">
          <div className="panel-title"><div><span className="label">SOURCE FILE</span><h2>Your document</h2></div><span className="file-count">{pdfFile ? '1 / 1' : 'empty'}</span></div>
          <div className={`upload-zone ${isDraggingOver ? 'dragging' : ''} ${pdfFile ? 'has-file' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDraggingOver(true) }} onDragLeave={() => setIsDraggingOver(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}><input ref={fileInputRef} type="file" accept="application/pdf" onChange={handlePdfChange} hidden />{pdfFile ? <><FileCheck2 className="upload-icon success" /><strong>{pdfFile.name}</strong><span>{(pdfFile.size / 1024 / 1024).toFixed(2)} MB · ready to edit</span><button className="text-button" type="button" onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click() }}>Replace file</button></> : <><UploadCloud className="upload-icon" /><strong>Drop your PDF here</strong><span>or click to browse from your device</span><button className="browse-button" type="button">Choose PDF <FileUp size={15} /></button></>}</div>
          <div className="asset-section"><div className="panel-title"><div><span className="label">MARKS</span><h2>Add to PDF</h2></div><span className="file-count">{placements.length} added</span></div><div className="asset-buttons"><button type="button" className="asset-button" onClick={() => signatureInputRef.current?.click()}><span className="asset-icon signature-icon"><MousePointer2 size={17} /></span><span><strong>{savedSignature ? 'Upload new signature' : 'Signature'}</strong><small>{savedSignature ? `Saved: ${savedSignature.name}` : 'PNG or JPG'}</small></span><ImagePlus size={16} /></button>{savedSignature && <button type="button" className="saved-button" onClick={() => addSavedAsset(savedSignature, 'signature')}><Check size={13} /> Use saved signature</button>}<button type="button" className="asset-button" onClick={() => stampInputRef.current?.click()}><span className="asset-icon stamp-icon"><Stamp size={17} /></span><span><strong>{savedStamp ? 'Upload new stamp' : 'Stamp'}</strong><small>{savedStamp ? `Saved: ${savedStamp.name}` : 'PNG or JPG'}</small></span><ImagePlus size={16} /></button>{savedStamp && <button type="button" className="saved-button" onClick={() => addSavedAsset(savedStamp, 'stamp')}><Check size={13} /> Use saved stamp</button>}<input ref={signatureInputRef} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => addAsset(event, 'signature')} /><input ref={stampInputRef} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => addAsset(event, 'stamp')} /></div></div>
          {selected && <div className="edit-section"><div className="panel-title"><div><span className="label">SELECTED MARK</span><h2>{selected.kind === 'signature' ? 'Signature' : 'Stamp'} settings</h2></div><button className="icon-button" title="Remove mark" onClick={() => { setPlacements((items) => items.filter((item) => item.id !== selected.id)); setSelectedId(null) }}><Trash2 size={15} /></button></div><div className="file-pill"><span className={`mini-mark ${selected.kind}`} /><span>{selected.name}</span></div><div className="size-control"><div className="size-heading"><span>Adjust size</span><output>{Math.round(selected.width)}%</output></div><div className="size-stepper"><button type="button" title="Make smaller" onClick={() => adjustSelectedSize(-2)}><Minus size={13} /></button><input aria-label="Mark size" type="range" min="5" max="70" value={selected.width} onChange={(event) => updateSelected({ width: Number(event.target.value) })} /><button type="button" title="Make larger" onClick={() => adjustSelectedSize(2)}><Plus size={13} /></button></div><small className="size-help">Drag the corner handle on the selected mark for free resizing.</small></div></div>}
        </aside>
        <div className="canvas-area"><div className="canvas-toolbar"><div><span className="label">PAGE PREVIEW</span><strong>{pdfFile ? pdfFile.name : 'No document selected'}</strong></div><div className="toolbar-meta"><span>Page 1 of 1</span><span className="zoom">Fit to view</span></div></div><div className="paper-stage" onClick={() => setSelectedId(null)}>{pdfFile ? <div className="paper" ref={pageRef} style={{ aspectRatio: `${pageSize.width} / ${pageSize.height}` }}><canvas ref={canvasRef} className="pdf-canvas" aria-label="Uploaded PDF page preview" />{placements.map((placement) => <div key={placement.id} className={`placement ${selectedId === placement.id ? 'selected' : ''}`} style={{ left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%` }} onPointerDown={(event) => handlePointerDown(event, placement.id)}><img src={placement.src} alt={placement.kind} /><span className="handle" onPointerDown={(event) => handleResizeDown(event, placement.id)} /></div>)}</div> : <div className="empty-preview"><div className="empty-icon"><FileUp size={28} /></div><h2>Start with a PDF</h2><p>Your document preview will appear here. Upload a PDF from the panel to begin.</p><button className="browse-button dark" type="button" onClick={() => fileInputRef.current?.click()}>Upload PDF <UploadCloud size={16} /></button></div>}</div><div className="canvas-hint"><MousePointer2 size={14} /> Drag a mark to move it <span>·</span> Drag its corner or use the size controls to resize</div></div>
      </section>
      <footer className="bottom-bar"><div className="status"><span className={`status-dot ${pdfFile ? 'ready' : ''}`} />{pdfFile ? `${placements.length} mark${placements.length === 1 ? '' : 's'} ready` : 'Upload a PDF to get started'}</div><div className="footer-actions"><button className="reset-button" type="button" onClick={() => { setPlacements([]); setSelectedId(null) }} disabled={!placements.length}><RotateCcw size={15} /> Reset marks</button><button className="export-button" type="button" onClick={() => void exportPdf()} disabled={!pdfFile || isExporting}><Download size={16} /> {isExporting ? 'Preparing PDF...' : 'Export signed PDF'}</button></div></footer>
    </main>
  )
}

export default App

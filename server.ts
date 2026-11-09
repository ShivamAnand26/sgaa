import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In AI Studio / Cloud Run, port 8080 is reserved for the Nginx ingress reverse proxy.
// The Express dev/backend server must always bind to port 3000 (or the explicit --port CLI argument).
const portArgIdx = process.argv.indexOf('--port');
const portFromArgs = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? parseInt(process.argv[portArgIdx + 1], 10) : null;
const envPort = process.env.PORT && process.env.PORT !== '8080' ? parseInt(process.env.PORT, 10) : null;
const PORT = portFromArgs || envPort || 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const PDF_DIR = path.resolve(DATA_DIR, 'pdfs');
const NOTES_FILE = path.resolve(DATA_DIR, 'notes.json');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}
if (!fs.existsSync(NOTES_FILE)) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify([], null, 2), 'utf-8');
}

export interface NoteItem {
  id: string;
  title: string;
  subject: string;
  category: string;
  price: number;
  pages: number;
  pageCount: number;
  previewPages: number;
  description: string;
  author: string;
  language: string;
  keyTopics: string[];
  tableOfContents: string[];
  includedItems: string[];
  hasPdf: boolean;
  fileSize?: number;
  coverUrl?: string;
  status: 'published' | 'draft';
  published: boolean;
  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

// Multer memory storage for PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

function readNotes(): NoteItem[] {
  try {
    if (!fs.existsSync(NOTES_FILE)) {
      return [];
    }
    const data = fs.readFileSync(NOTES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[Server DB] Error reading notes:', err);
    return [];
  }
}

function writeNotes(notes: NoteItem[]): void {
  try {
    fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Server DB] Error writing notes:', err);
  }
}

async function startServer() {
  const app = express();

  // Basic middleware
  app.use(express.json({ limit: '60mb' }));
  app.use(express.urlencoded({ extended: true, limit: '60mb' }));

  // Content Security Policy: Allow only Google Maps in iframe frame-src, blocking other external frames
  app.use((_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:; frame-src 'self' https://www.google.com;"
    );
    next();
  });

  // --------------------------------------------------------------------------
  // REST API Endpoints: Database Backend for Notes & PDF System
  // --------------------------------------------------------------------------

  // Status & Health Check
  app.get('/api/health', (_req: Request, res: Response) => {
    const notes = readNotes();
    res.json({
      ok: true,
      status: 'ready',
      database: 'server-disk-storage',
      mode: 'clean-production-slate',
      notesCount: notes.length,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/db/status', (_req: Request, res: Response) => {
    const notes = readNotes();
    let totalPdfBytes = 0;
    let pdfCount = 0;
    try {
      const files = fs.readdirSync(PDF_DIR);
      for (const file of files) {
        if (file.endsWith('.pdf')) {
          pdfCount++;
          const stat = fs.statSync(path.join(PDF_DIR, file));
          totalPdfBytes += stat.size;
        }
      }
    } catch {}

    res.json({
      ok: true,
      databaseType: 'Free Built-in Server Storage',
      status: 'healthy',
      totalNotes: notes.length,
      publishedNotes: notes.filter(n => n.published).length,
      totalPdfs: pdfCount,
      totalPdfStorageMb: parseFloat((totalPdfBytes / (1024 * 1024)).toFixed(2)),
      storagePath: PDF_DIR
    });
  });

  // Clear all data endpoint (if admin requests complete clean wipe)
  app.post('/api/notes/clear', (_req: Request, res: Response) => {
    writeNotes([]);
    try {
      const files = fs.readdirSync(PDF_DIR);
      for (const f of files) {
        fs.unlinkSync(path.join(PDF_DIR, f));
      }
    } catch {}
    res.json({ ok: true, message: 'All study notes and documents cleared.' });
  });

  // List Notes with search and filters
  app.get('/api/notes', (req: Request, res: Response) => {
    const notes = readNotes();
    const { search, subject, category, minPrice, maxPrice, sort } = req.query;

    let result = [...notes];

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.subject.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.author.toLowerCase().includes(q)
      );
    }

    if (subject && typeof subject === 'string' && subject !== 'all') {
      result = result.filter(n => n.subject.toLowerCase() === subject.toLowerCase());
    }

    if (category && typeof category === 'string' && category !== 'all') {
      result = result.filter(n => n.category.toLowerCase() === category.toLowerCase());
    }

    if (minPrice) {
      const min = Number(minPrice);
      if (!isNaN(min)) result = result.filter(n => n.price >= min);
    }

    if (maxPrice) {
      const max = Number(maxPrice);
      if (!isNaN(max)) result = result.filter(n => n.price <= max);
    }

    if (sort === 'price-asc') {
      result.sort((a, b) => a.price - b.price);
    } else if (sort === 'price-desc') {
      result.sort((a, b) => b.price - a.price);
    } else if (sort === 'popular') {
      result.sort((a, b) => (b.reviewCount * b.rating) - (a.reviewCount * a.rating));
    } else {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    res.json({
      ok: true,
      data: result,
      total: result.length
    });
  });

  // Get Single Note
  app.get('/api/notes/:id', (req: Request, res: Response) => {
    const notes = readNotes();
    const note = notes.find(n => n.id === req.params.id);
    if (!note) {
      res.status(404).json({ ok: false, error: 'Note not found' });
      return;
    }
    res.json({ ok: true, data: note });
  });

  // Create or Update Note Metadata (Supports both JSON and multipart FormData with PDF)
  const handleSaveNote = async (req: Request, res: Response) => {
    try {
      const notes = readNotes();
      const body = req.body || {};
      const file = req.file;

      const paramId = req.params?.id;
      const id = (paramId && paramId !== 'undefined') 
        ? paramId 
        : (body.id && body.id !== 'undefined' ? body.id : `NOTE-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`);
      
      const existingIndex = notes.findIndex(n => n.id === id);

      let pages = Math.max(1, parseInt(body.pages || body.pageCount, 10) || 1);
      const isPublished = body.published !== 'false' && body.published !== false && body.status !== 'draft';

      const pdfPath = path.resolve(PDF_DIR, `${id}.pdf`);
      let hasPdfOnDisk = fs.existsSync(pdfPath);
      let diskFileSize = hasPdfOnDisk ? fs.statSync(pdfPath).size : undefined;

      // If PDF file was directly uploaded with the note
      if (file && file.buffer) {
        try {
          const loadedDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
          pages = loadedDoc.getPageCount();
        } catch (pdfErr: any) {
          console.warn('[Server DB] pdf-lib page count warning:', pdfErr.message);
        }
        fs.writeFileSync(pdfPath, file.buffer);
        hasPdfOnDisk = true;
        diskFileSize = file.buffer.length;
      }

      let parsedTopics: string[] = [];
      if (Array.isArray(body.keyTopics)) {
        parsedTopics = body.keyTopics;
      } else if (typeof body.keyTopics === 'string' && body.keyTopics.trim()) {
        try {
          const parsed = JSON.parse(body.keyTopics);
          parsedTopics = Array.isArray(parsed) ? parsed : [body.keyTopics];
        } catch {
          parsedTopics = body.keyTopics.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }

      let parsedToc: string[] = [];
      if (Array.isArray(body.tableOfContents)) {
        parsedToc = body.tableOfContents;
      } else if (typeof body.tableOfContents === 'string' && body.tableOfContents.trim()) {
        try {
          parsedToc = JSON.parse(body.tableOfContents);
        } catch {
          parsedToc = [body.tableOfContents];
        }
      }

      const noteRecord: NoteItem = {
        id,
        title: (body.title || 'Architectural Study Note').trim(),
        subject: (body.subject || 'Architecture').trim(),
        category: body.category || 'structures',
        price: Math.max(0, Number(body.price) || 0),
        pages,
        pageCount: pages,
        previewPages: Math.max(1, parseInt(body.previewPages, 10) || 3),
        description: (body.description || '').trim(),
        author: (body.author || 'SGA Faculty').trim(),
        language: body.language || 'English',
        keyTopics: parsedTopics,
        tableOfContents: parsedToc,
        includedItems: Array.isArray(body.includedItems) ? body.includedItems : ['Complete verified PDF'],
        hasPdf: hasPdfOnDisk,
        fileSize: diskFileSize,
        coverUrl: body.coverUrl || (existingIndex !== -1 ? notes[existingIndex].coverUrl : ''),
        status: isPublished ? 'published' : 'draft',
        published: isPublished,
        rating: existingIndex !== -1 ? notes[existingIndex].rating : 5.0,
        reviewCount: existingIndex !== -1 ? notes[existingIndex].reviewCount : 0,
        createdAt: existingIndex !== -1 ? notes[existingIndex].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (existingIndex !== -1) {
        notes[existingIndex] = { ...notes[existingIndex], ...noteRecord };
      } else {
        notes.unshift(noteRecord);
      }

      writeNotes(notes);
      res.json({ ok: true, data: noteRecord });
    } catch (saveErr: any) {
      console.error('[Server DB] Error saving note:', saveErr);
      res.status(500).json({ ok: false, error: saveErr.message || 'Failed to save note' });
    }
  };

  app.post('/api/notes', upload.single('pdf'), handleSaveNote);
  app.post('/api/notes/:id', upload.single('pdf'), handleSaveNote);
  app.put('/api/notes/:id', upload.single('pdf'), handleSaveNote);

  // Delete Note
  app.delete('/api/notes/:id', (req: Request, res: Response) => {
    let notes = readNotes();
    const id = req.params.id;
    notes = notes.filter(n => n.id !== id);
    writeNotes(notes);

    const pdfPath = path.resolve(PDF_DIR, `${id}.pdf`);
    if (fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch {}
    }

    res.json({ ok: true, message: 'Note and PDF deleted successfully.' });
  });

  // Upload PDF for Note
  app.post('/api/notes/:id/upload', upload.single('pdf'), async (req: Request, res: Response) => {
    const id = req.params.id;
    const file = req.file;

    if (!file) {
      res.status(400).json({ ok: false, error: 'No PDF file provided in request.' });
      return;
    }

    // Verify PDF header %PDF-
    const header = file.buffer.slice(0, 5).toString('ascii');
    if (!header.startsWith('%PDF-')) {
      res.status(400).json({ ok: false, error: 'Uploaded file is not a valid PDF (%PDF- signature missing).' });
      return;
    }

    try {
      // Calculate real page count using pdf-lib
      const loadedDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
      const pageCount = loadedDoc.getPageCount();

      // Save PDF to persistent server disk
      const pdfPath = path.resolve(PDF_DIR, `${id}.pdf`);
      fs.writeFileSync(pdfPath, file.buffer);

      // Update Note record
      const notes = readNotes();
      let note = notes.find(n => n.id === id);
      if (note) {
        note.hasPdf = true;
        note.pages = pageCount;
        note.pageCount = pageCount;
        note.fileSize = file.buffer.length;
        note.updatedAt = new Date().toISOString();
        writeNotes(notes);
      } else {
        note = {
          id,
          title: path.basename(file.originalname, path.extname(file.originalname)) || 'Uploaded Study Note',
          subject: 'Architecture',
          category: 'structures',
          price: 499,
          pages: pageCount,
          pageCount,
          previewPages: 3,
          description: '',
          author: 'SGA Faculty',
          language: 'English',
          keyTopics: [],
          tableOfContents: [],
          includedItems: ['Verified PDF Document'],
          hasPdf: true,
          fileSize: file.buffer.length,
          status: 'published',
          published: true,
          rating: 5.0,
          reviewCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        notes.unshift(note);
        writeNotes(notes);
      }

      res.json({
        ok: true,
        data: {
          note,
          pageCount,
          fileSize: file.buffer.length,
          filename: file.originalname
        }
      });
    } catch (err: any) {
      console.error('[Server DB] Error processing uploaded PDF:', err);
      res.status(500).json({ ok: false, error: `Failed to process PDF: ${err.message}` });
    }
  });

  // Stream full PDF document directly (Protected: Requires active student authorization)
  app.get('/api/notes/:id/pdf', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || req.headers['x-sga-auth'] || req.query.token;
    if (!authHeader) {
      res.status(401).json({ ok: false, error: 'Unauthorized: Full PDF is available only to authenticated student purchases.' });
      return;
    }

    const id = req.params.id;
    const pdfPath = path.resolve(PDF_DIR, `${id}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      res.status(404).json({ ok: false, error: 'PDF file not found in database storage.' });
      return;
    }

    const notes = readNotes();
    const note = notes.find(n => n.id === id);
    const safeTitle = (note?.title || 'document').replace(/[^a-zA-Z0-9_\-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeTitle}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-cache');

    const stream = fs.createReadStream(pdfPath);
    stream.pipe(res);
  });

  // Stream preview PDF (first N pages extracted via pdf-lib)
  app.get('/api/notes/:id/preview-pdf', async (req: Request, res: Response) => {
    const id = req.params.id;
    const pdfPath = path.resolve(PDF_DIR, `${id}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      res.status(404).json({ ok: false, error: 'PDF file not found in database storage.' });
      return;
    }

    try {
      const notes = readNotes();
      const note = notes.find(n => n.id === id);
      const previewPagesLimit = note?.previewPages || 3;

      const fileBuffer = fs.readFileSync(pdfPath);
      const srcDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
      const totalPages = srcDoc.getPageCount();

      if (totalPages <= previewPagesLimit) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="preview_${id}.pdf"`);
        res.send(fileBuffer);
        return;
      }

      // Extract first N pages into a preview PDF
      const previewDoc = await PDFDocument.create();
      const pageIndices = Array.from({ length: previewPagesLimit }, (_, i) => i);
      const copiedPages = await previewDoc.copyPages(srcDoc, pageIndices);
      copiedPages.forEach(p => previewDoc.addPage(p));

      const previewBytes = await previewDoc.save();
      const safeBuffer = Buffer.from(previewBytes);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="preview_${id}.pdf"`);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.send(safeBuffer);
    } catch (err: any) {
      console.warn('[Server DB] Preview PDF extraction fallback to full stream:', err);
      res.setHeader('Content-Type', 'application/pdf');
      fs.createReadStream(pdfPath).pipe(res);
    }
  });

  // --------------------------------------------------------------------------
  // Mount Vite middleware for serving frontend SPA and static assets
  // --------------------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SGA.IN Server] Database & PDF backend listening at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[SGA.IN Server] Fatal startup error:', err);
  process.exit(1);
});

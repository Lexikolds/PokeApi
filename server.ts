// server.ts - Backend API Pokemon con Cookies + Frontend integrado
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3000;

// CONFIGURA TUS CREDENCIALES DE SUPABASE AQUÍ
const SUPABASE_URL: string = 'https://ltyjqeomdncvxladkgfn.supabase.co';
const SUPABASE_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eWpxZW9tZG5jdnhsYWRrZ2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNTQ2MDYsImV4cCI6MjA3NjYzMDYwNn0.uochKK-DPWFJ_onvWenSedQshpBbv978KNiHgAlmF28';
const JWT_SECRET: string = 'PokeApi:pokeapi123$';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración de middleware
app.use(cors({
  origin: `http://localhost:${PORT}`, // Solo permite localhost:3000
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// --- PARA SERVIR EL FRONTEND ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sirve archivos estáticos (CSS, JS, imágenes, etc.)
app.use(express.static(__dirname));

// Sirve index.html en la raíz
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Interfaces TypeScript
interface User {
  id: string;
  username: string;
  password: string;
  can_view_pokemon: boolean;
}

interface JwtPayload {
  userId: string;
  username: string;
  canViewPokemon: boolean;
}

interface AuthRequest extends Request {
  user?: JwtPayload;
}

// Middleware de autenticación - LEE EL TOKEN DE LA COOKIE
const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user as JwtPayload;
    next();
  });
};

// RUTA: Inicializar usuarios (ejecutar una vez)
app.post('/api/init-users', async (req: Request, res: Response) => {
  const initialUsers = [
    { username: 'ash', password: 'pikachu123', can_view_pokemon: true },
    { username: 'misty', password: 'starmie123', can_view_pokemon: true },
    { username: 'brock', password: 'onix123', can_view_pokemon: true },
    { username: 'team_rocket', password: 'meowth123', can_view_pokemon: false },
    { username: 'gary', password: 'rival123', can_view_pokemon: false }
  ];

  try {
    for (const user of initialUsers) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      
      const { error } = await supabase
        .from('users')
        .insert([{
          username: user.username,
          password: hashedPassword,
          can_view_pokemon: user.can_view_pokemon
        }]);

      if (error && error.code !== '23505') { // 23505 = duplicado
        console.error('Error creando usuario:', user.username, error);
      }
    }

    res.json({ 
      message: 'Usuarios inicializados correctamente',
      users: initialUsers.map(u => ({ 
        username: u.username, 
        password: u.password,
        can_view: u.can_view_pokemon 
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear usuarios' });
  }
});

// RUTA: Login - CREA LA COOKIE CON EL TOKEN
app.post('/api/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = data as User;
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        canViewPokemon: user.can_view_pokemon 
      } as JwtPayload,
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // GUARDA EL TOKEN EN UNA COOKIE SEGURA
    res.cookie('token', token, {
      httpOnly: true,     // No accesible desde JavaScript
      secure: false,      // Cambia a true en producción (HTTPS)
      sameSite: 'lax',    // Protección contra CSRF
      maxAge: 24 * 60 * 60 * 1000 // 24 horas
    });

    res.json({ 
      username: user.username,
      canViewPokemon: user.can_view_pokemon
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// RUTA: Logout - ELIMINA LA COOKIE
app.post('/api/logout', (req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Sesión cerrada correctamente' });
});

// RUTA: Verificar token (para ver si hay sesión activa)
app.get('/api/verify', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

// RUTA: Obtener Pokémon por ID/nombre
app.get('/api/pokemon/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const user = req.user as JwtPayload;

  if (!user.canViewPokemon) {
    return res.status(403).json({ error: 'No tienes permisos para ver Pokémon' });
  }

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${req.params.id.toLowerCase()}`);
    if (!response.ok) throw new Error('Pokémon no encontrado');
    const pokemon: any = await response.json();
    
    res.json({
      name: pokemon.name,
      id: pokemon.id,
      types: pokemon.types.map((t: any) => t.type.name),
      sprite: pokemon.sprites.front_default,
      height: pokemon.height,
      weight: pokemon.weight
    });
  } catch (error) {
    res.status(404).json({ error: 'Pokémon no encontrado' });
  }
});

// RUTA: Listar Pokémon
app.get('/api/pokemon', authenticateToken, async (req: AuthRequest, res: Response) => {
  const user = req.user as JwtPayload;

  if (!user.canViewPokemon) {
    return res.status(403).json({ error: 'No tienes permisos para ver Pokémon' });
  }

  try {
    const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=20');
    const data: any = await response.json();
    res.json(data.results);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo lista de Pokémon' });
  }
});

// INICIAR SERVIDOR
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Sistema de cookies activado`);
  console.log(`Abre en el navegador: http://localhost:${PORT}`);
  console.log(`Para inicializar usuarios: POST http://localhost:${PORT}/api/init-users`);
});
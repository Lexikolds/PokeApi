// server.ts - Backend API con Express y TypeScript
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const app = express();
const PORT = 3000;

// Configura estas variables con tus credenciales de Supabase
const SUPABASE_URL = 'https://ltyjqeomdncvxladkgfn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eWpxZW9tZG5jdnhsYWRrZ2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNTQ2MDYsImV4cCI6MjA3NjYzMDYwNn0.uochKK-DPWFJ_onvWenSedQshpBbv978KNiHgAlmF28';
const JWT_SECRET = 'PokeApi:pokeapi123$';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json());

// Interfaces
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

// Extender Request para incluir user
interface AuthRequest extends Request {
  user?: JwtPayload;
}

// Middleware de autenticación
const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

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

// Ruta para crear usuarios iniciales (solo ejecutar una vez)
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

      if (error && error.code !== '23505') { // Ignora duplicados
        console.error('Error creando usuario:', user.username, error);
      }
    }

    res.json({ 
      message: 'Usuarios inicializados',
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

// Ruta de login
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

    res.json({ 
      token,
      username: user.username,
      canViewPokemon: user.can_view_pokemon
    });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Ruta para obtener Pokémon (protegida)
app.get('/api/pokemon/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const user = req.user as JwtPayload;

  if (!user.canViewPokemon) {
    return res.status(403).json({ 
      error: 'No tienes permisos para ver Pokémon' 
    });
  }

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${req.params.id}`);
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
    res.status(500).json({ error: 'Error obteniendo Pokémon' });
  }
});

// Ruta para listar Pokémon (protegida)
app.get('/api/pokemon', authenticateToken, async (req: AuthRequest, res: Response) => {
  const user = req.user as JwtPayload;

  if (!user.canViewPokemon) {
    return res.status(403).json({ 
      error: 'No tienes permisos para ver Pokémon' 
    });
  }

  try {
    const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=20');
    const data: any = await response.json();
    res.json(data.results);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo lista de Pokémon' });
  }
});

// Verificar token
app.get('/api/verify', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
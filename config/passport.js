const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

passport.use('epic', new OAuth2Strategy({
  authorizationURL: 'https://www.epicgames.com/id/authorize',
  tokenURL: 'https://api.epicgames.dev/epic/oauth/v1/token',
  clientID: process.env.EPIC_CLIENT_ID,
  clientSecret: process.env.EPIC_CLIENT_SECRET,
  callbackURL: process.env.EPIC_REDIRECT_URI,
  scope: 'basic_profile'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Fetch user info from Epic Games API
    const response = await fetch('https://api.epicgames.dev/epic/id/v1/accounts', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user data from Epic Games');
    }
    
    const userData = await response.json();
    const epicUser = userData[0];

    if (!epicUser) {
      throw new Error('No user data received from Epic Games');
    }

    let user = await prisma.user.findUnique({
      where: { epicId: epicUser.accountId }
    });

    if (!user) {
      const adminIds = process.env.ADMIN_EPIC_IDS?.split(',') || [];
      const role = adminIds.includes(epicUser.accountId) ? 'ADMIN' : 'USER';
      
      user = await prisma.user.create({
        data: {
          epicId: epicUser.accountId,
          nickname: epicUser.displayName || `User_${epicUser.accountId.slice(-8)}`,
          role
        }
      });
      
      console.log(`✅ New user registered: ${user.nickname} (${user.role})`);
    } else {
      // Update nickname if changed
      if (user.nickname !== epicUser.displayName) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { nickname: epicUser.displayName }
        });
      }
    }

    return done(null, user);
  } catch (error) {
    console.error('Epic OAuth Error:', error);
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        epicId: true,
        nickname: true,
        balance: true,
        role: true,
        isBanned: true,
        createdAt: true
      }
    });
    done(null, user);
  } catch (error) {
    console.error('Deserialize user error:', error);
    done(error, null);
  }
});

module.exports = passport;
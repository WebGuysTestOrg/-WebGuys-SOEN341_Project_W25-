const protectRoute = (req, res, next) => {
    console.log('ProtectRoute middleware - Session:', req.session);
    if (req.session && req.session.user) {
        console.log('User authenticated:', req.session.user);
        next();
    } else {
        console.log('No session or user found, redirecting to login');
        res.redirect('/login_form.html');
    }
};

const protectAdminRoute = (req, res, next) => {
    console.log('ProtectAdminRoute middleware - Session:', req.session);
    if (req.session && req.session.user && req.session.user.user_type === 'admin') {
        console.log('Admin authenticated:', req.session.user);
        next();
    } else {
        console.log('Not admin or no session, redirecting to login');
        res.redirect('/login_form.html');
    }
};

module.exports = {
    protectRoute,
    protectAdminRoute
}; 
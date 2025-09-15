// 选择性拦截配置
module.exports = {
    // 需要拦截的域名列表（支持子域名匹配）
    domains: [
        // 'api.example.com',
        // 'auth.mysite.com'
    ],
    
    // 需要拦截的完整URL列表
    urls: [
        // 'cdn.example.com/api/v1/user'
    ],
    
    // 需要拦截的URL前缀列表
    urlPrefixes: [
        // 'api.example.com/v1/',
        // 'auth.mysite.com/oauth/'
    ],
    
    // 需要拦截的路径前缀列表
    pathPrefixes: [
        // '/api/',
        // '/auth/',
        // '/admin/'
    ],
    
    // 强制快速模式的域名列表
    fastDomains: [
        'cdn.jsdelivr.net',
        'fonts.googleapis.com',
        'ajax.googleapis.com',
        'unpkg.com',
        'cdnjs.cloudflare.com'
    ],
    
    // 静态资源扩展名（自动走快速模式）
    staticExtensions: [
        '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
        '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.pdf', '.zip',
        '.webp', '.avif', '.webm', '.ogg'
    ]
};

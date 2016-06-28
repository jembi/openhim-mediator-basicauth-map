'use strict'

const http = require('http')

http.createServer((req, res) => {
  console.log(`Recieved ${req.method} to ${req.url} with headers:`)
  console.log(req.headers)
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    console.log(`With body: ${body}`)
    res.writeHead(200, { 'content-type': 'something/plain' })
    res.end('A response body\n')
  })
}).listen(44444, () => {
  console.log('Test upstream server listening on 44444')
})

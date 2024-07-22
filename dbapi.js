dbapi.removeUserAccessTokens = function (email) {
  return db.run(r.table('accessTokens').getAll(email, {
    index: 'email'
  }).delete())
}

dbapi.removeUserAccessToken = function (email, title) {
  return db.run(r.table('accessTokens').getAll(email, {
    index: 'email'
  }).filter({ title: title }).delete())
}

dbapi.removeAccessToken = function (id) {
  return db.run(r.table('accessTokens').get(id).delete())
}

dbapi.loadAccessTokens = function (email) {
  return db.run(r.table('accessTokens').getAll(email, {
    index: 'email'
  }))
}

dbapi.loadAccessToken = function (id) {
  return db.run(r.table('accessTokens').get(id))
}

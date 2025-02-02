const bcrypt = require('bcryptjs')
const {
  User,
  Restaurant,
  Comment,
  Favorite,
  Like,
  Followship
} = require('../models')
const { imgurFileHandler } = require('../helpers/file-helpers')
const { getUser } = require('../helpers/auth-helpers')

const userController = {
  signUpPage: (req, res) => {
    res.render('signup')
  },
  signUp: (req, res, next) => {
    if (req.body.password !== req.body.passwordCheck) {
      throw new Error('Passwords do not match!')
    }
    const { file } = req
    User.findOne({ where: { email: req.body.email } })
      .then(user => {
        if (user) throw new Error('Email already exist')
        return Promise.all([
          bcrypt.hash(req.body.password, 10),
          imgurFileHandler(file)
        ])
      })
      .then(([hash, image]) =>
        User.create({
          name: req.body.name,
          email: req.body.email,
          password: hash,
          image
        })
      )
      .then(() => {
        req.flash('success_messages', '成功註冊帳號')
        res.redirect('/signin')
      })
      .catch(err => next(err))
  },
  signInPage: (req, res) => {
    res.render('signin')
  },
  signIn: (req, res) => {
    req.flash('success_messages', '成功登入！')
    res.redirect('/restaurants')
  },
  logout: (req, res) => {
    req.flash('success_messages', '成功登出！')
    req.logout()
    res.redirect('/signin')
  },
  getUser: (req, res, next) => {
    return Promise.all([
      User.findByPk(req.params.id, {
        include: [
          { model: Restaurant, as: 'FavoritedRestaurants' },
          { model: User, as: 'Followers' },
          { model: User, as: 'Followings' }
        ]
      }),
      Comment.findAndCountAll({
        where: { userId: req.params.id },
        include: Restaurant,
        raw: true,
        nest: true
      })
    ])
      .then(([user, comment]) => {
        if (!user) throw new Error("User didn't exist")
        const restaurants = comment.rows.map(r => r.Restaurant)
        const groupRestaurants = restaurants.filter(
          (restaurant, index, thisArray) => {
            return (
              index === thisArray.findIndex(value => value.id === restaurant.id)
            )
          }
        )
        user.dataValues.isFollowed =
          req.user && req.user.Followings.some(f => f.id === user.dataValues.id)
        return res.render('users/profile', {
          user: user.toJSON(),
          comment,
          restaurants: groupRestaurants
        })
      })
      .catch(err => next(err))
  },
  editUser: (req, res, next) => {
    const login = getUser(req)
    return User.findByPk(req.params.id, { raw: true })
      .then(user => {
        if (!user) throw new Error("User didn't exist")
        if (user.id !== login.id) throw new Error('It is not your profile')

        return res.render('users/edit', { user })
      })
      .catch(err => next(err))
  },
  putUser: (req, res, next) => {
    if (!req.body.name) throw new Error('Name is required')
    const login = req.user
    const { file } = req
    return Promise.all([User.findByPk(req.params.id), imgurFileHandler(file)])
      .then(([user, filePath]) => {
        if (!user) throw new Error("User didn't exist")
        if (user.id !== login.id) throw new Error('It is not your profile')
        return user.update({
          name: req.body.name,
          image: filePath || user.image
        })
      })
      .then(() => {
        req.flash('success_messages', '使用者資料編輯成功')
        return res.redirect(`/users/${req.params.id}`)
      })
      .catch(err => next(err))
  },
  addFavorite: (req, res, next) => {
    const { restaurantId } = req.params
    return Promise.all([
      Restaurant.findByPk(restaurantId),
      Favorite.findOne({ where: { userId: req.user.id, restaurantId } })
    ])
      .then(([restaurant, favorite]) => {
        if (!restaurant) throw new Error("Restaurant didn't exist")
        if (favorite) throw new Error('You have favorited this restaurant')
        return Favorite.create({ userId: req.user.id, restaurantId })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeFavorite: (req, res, next) => {
    return Favorite.findOne({
      where: { userId: req.user.id, restaurantId: req.params.restaurantId }
    })
      .then(favorite => {
        if (!favorite) throw new Error("You haven't favorited this restaurant")
        return favorite.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  addLike: (req, res, next) => {
    const { restaurantId } = req.params
    return Promise.all([
      Restaurant.findByPk(restaurantId),
      Like.findOne({ where: { userId: req.user.id, restaurantId } })
    ])
      .then(([restaurant, like]) => {
        if (!restaurant) throw new Error("Restaurant didn't exist")
        if (like) throw new Error('You have liked this restaurant')
        return Like.create({ userId: req.user.id, restaurantId })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeLike: (req, res, next) => {
    return Like.findOne({
      where: { userId: req.user.id, restaurantId: req.params.restaurantId }
    })
      .then(like => {
        if (!like) throw new Error("You haven't liked this restaurant")
        return like.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  getTopUsers: (req, res, next) => {
    return User.findAll({ include: [{ model: User, as: 'Followers' }] })
      .then(users => {
        users = users
          .map(user => ({
            ...user.toJSON(),
            followerCount: user.Followers.length,
            isFollowed: req.user.Followings.some(f => f.id === user.id)
          }))
          .sort((a, b) => b.followerCount - a.followerCount)
        return res.render('top-users', { users })
      })
      .catch(err => next(err))
  },
  addFollowing: (req, res, next) => {
    const { userId } = req.params
    Promise.all([
      User.findByPk(userId),
      Followship.findOne({
        where: { followerId: req.user.id, followingId: userId }
      })
    ])
      .then(([user, followship]) => {
        if (req.user.id === Number(userId)) {
          throw new Error("You can't follow yourself")
        }
        if (!user) throw new Error("User didn't exist")
        if (followship) throw new Error('You are already following this user')
        return Followship.create({
          followerId: req.user.id,
          followingId: userId
        })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeFollowing: (req, res, next) => {
    Followship.findOne({
      where: { followerId: req.user.id, followingId: req.params.userId }
    })
      .then(followship => {
        if (!followship) throw new Error("You haven't followed this user")
        return followship.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  }
}

module.exports = userController

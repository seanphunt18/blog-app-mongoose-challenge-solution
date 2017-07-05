const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

// this makes the should syntax available throughout
// this module
const should = chai.should();

const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);

// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for author, title, content
// and then we insert that data into mongo
function seedBlogPostData() {
  console.info('seeding blog post data');
  const seedData = [];

  for (let i=1; i<=10; i++) {
    seedData.push(generateBlogPostData());
  }
  // this will return a promise
  return BlogPost.insertMany(seedData);
}

// // used to generate data to put in db
// function generateBoroughName() {
//   const boroughs = [
//     'Manhattan', 'Queens', 'Brooklyn', 'Bronx', 'Staten Island'];
//   return boroughs[Math.floor(Math.random() * boroughs.length)];
// }

// // used to generate data to put in db
// function generateCuisineType() {
//   const cuisines = ['Italian', 'Thai', 'Colombian'];
//   return cuisines[Math.floor(Math.random() * cuisines.length)];
// }

// // used to generate data to put in db
// function generateGrade() {
//   const grades = ['A', 'B', 'C', 'D', 'F'];
//   const grade = grades[Math.floor(Math.random() * grades.length)];
//   return {
//     date: faker.date.past(),
//     grade: grade
//   }
// }

// generate an object represnting a restaurant.
// can be used to generate seed data for db
// or request.body data
function generateBlogPostData() {
  return {
    author: {
      firstName: faker.random.first_name(),
      lastName: faker.random.last_name()
    },
    content: faker.lorem.paragraphs(),
    title: faker.lorem.sentence()
  }
}


// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure  ata from one test does not stick
// around for next one
function tearDownDb() {
    console.warn('Deleting database');
    return mongoose.connection.dropDatabase();
}

describe('Blog Posts API resource', function() {

  // we need each of these hook functions to return a promise
  // otherwise we'd need to call a `done` callback. `runServer`,
  // `seedRestaurantData` and `tearDownDb` each return a promise,
  // so we return the value returned by these function calls.
  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return seedBlogPostData();
  });

  afterEach(function() {
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  })

  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {

    it('should return all existing blog posts', function() {
      // strategy:
      //    1. get back all restaurants returned by by GET request to `/restaurants`
      //    2. prove res has right status, data type
      //    3. prove the number of restaurants we got back is equal to number
      //       in db.
      //
      // need to have access to mutate and access `res` across
      // `.then()` calls below, so declare it here so can modify in place
      let res;
      return chai.request(app)
        .get('/posts')
        .then(function(_res) {
          // so subsequent .then blocks can access resp obj.
          res = _res;
          res.should.have.status(200);
          // otherwise our db seeding didn't work
          res.body.should.have.length.of.at.least(1);
          return BlogPost.count();
        })
        .then(function(count) {
          res.body.should.have.length.of(count);
        });
    });


    it('should return blog posts with right fields', function() {
      // Strategy: Get back all restaurants, and ensure they have expected keys

      let resBlogPost;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {
          res.should.have.status(200);
          res.should.be.json;
          res.body.should.be.a('array');
          res.body.should.have.length.of.at.least(1);

          res.body.forEach(function(blogpost) {
            blogpost.should.be.a('object');
            blogpost.should.include.keys(
              'id', 'author', 'content', 'title', 'created');
          });
          resBlogPost = res.body[0];
          return BlogPost.findById(resBlogPost.id);
        })
        .then(function(blogpost) {

          resBlogPost.id.should.equal(blogpost.id);
          resBlogPost.author.should.equal(blogpost.authorName);
          resBlogPost.content.should.equal(blogpost.content);
          resBlogPost.title.should.equal(blogpost.title);
        });
    });
  });

  describe('POST endpoint', function() {
    // strategy: make a POST request with data,
    // then prove that the restaurant we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new blog post', function() {

      const newBlogPost = generateBlogPostData();

      return chai.request(app)
        .post('/posts')
        .send(newBlogPost)
        .then(function(res) {
          res.should.have.status(201);
          res.should.be.json;
          res.body.should.be.a('object');
          res.body.should.include.keys(
            'id', 'author', 'content', 'title', 'created');
          res.body.author.should.equal(
            `${newBlogPost.author.firstName} ${newBlogPost.author.lastName}`);
          // cause Mongo should have created id on insertion
          res.body.id.should.not.be.null;
          res.body.content.should.equal(newBlogPost.content);
          res.body.title.should.equal(newBlogPost.title);

          return BlogPost.findById(res.body.id);
        })
        .then(function(blogpost) {
          blogpost.author.firstName.should.equal(newBlogPost.author.firstName);
          blogpost.author.lastName.should.equal(newBlogPost.author.lastName);
          blogpost.content.should.equal(newBlogPost.content);
          blogpost.title.should.equal(newBlogPost.title);
        });
    });
  });

  describe('PUT endpoint', function() {

    // strategy:
    //  1. Get an existing restaurant from db
    //  2. Make a PUT request to update that restaurant
    //  3. Prove restaurant returned by request contains data we sent
    //  4. Prove restaurant in db is correctly updated
    it('should update fields you send over', function() {
      const updateData = {
        author: {
          firstName: 'John',
          lastName: 'Smith'
        },
        content: 'Disney does not want you to know this, but I just kinda killed her.',
        title: 'Pocahontas: My Side of the Story'
      };

      return BlogPost
        .findOne()
        .exec()
        .then(function(blogpost) {
          updateData.id = blogpost.id;

          // make request then inspect it to make sure it reflects
          // data we sent
          return chai.request(app)
            .put(`/posts/${blogpost.id}`)
            .send(updateData);
        })
        .then(function(res) {
          res.should.have.status(204);

          return BlogPost.findById(updateData.id).exec();
        })
        .then(function(blogpost) {
          blogpost.author.firstName.should.equal(updateData.author.firstName);
          blogpost.author.lastName.should.equal(updateData.author.lastName);
          blogpost.content.should.equal(updateData.content);
          blogpost.title.should.equal(updateData.title);
        });
      });
  });

  describe('DELETE endpoint', function() {
    // strategy:
    //  1. get a restaurant
    //  2. make a DELETE request for that restaurant's id
    //  3. assert that response has right status code
    //  4. prove that restaurant with the id doesn't exist in db anymore
    it('delete a blog post by id', function() {

      let blogpost;

      return BlogPost
        .findOne()
        .exec()
        .then(function(_blogpost) {
          blogpost = _blogpost;
          return chai.request(app).delete(`/posts/${blogpost.id}`);
        })
        .then(function(res) {
          res.should.have.status(204);
          return BlogPost.findById(blogpost.id).exec();
        })
        .then(function(_blogpost) {
          // when a variable's value is null, chaining `should`
          // doesn't work. so `_restaurant.should.be.null` would raise
          // an error. `should.be.null(_restaurant)` is how we can
          // make assertions about a null value.
          should.not.exist(_blogpost);
        });
    });
  });
});

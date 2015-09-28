'use strict';

var filterTransforms = {
  Events: {
    type: 'find',
    value: {
      '$and': [
        {
          'Full Name': {
            '$regex' : new RegExp('', 'i')
          }
        },
        {
          'Type': {
            '$regex' : new RegExp('', 'i')
          }
        },
        {
          'Begin Date and Time': {
            '$gte' : '1900-01-01'
          }
        },
        {
          'End Date and Time': {
            '$lte' : '2999-12-31'
          }
        }]
    }
  },
  Places: {
    type: 'find',
    value: {
      '$and': [
        {
          'Full Name': {
            '$regex' : new RegExp('', 'i')
          }
        },
        {
          'Type': {
            '$regex' : new RegExp('', 'i')
          }
        }]
    }
  },
  People: {
    type: 'find',
    value: {
      '$and': [
        {
          'Full Name': {
            '$regex' : new RegExp('', 'i')
          }
        },
        {
          'Ethnicity': {
            '$regex' : new RegExp('', 'i')
          }
        },
        {
          'Affiliation': {
            '$regex' : new RegExp('', 'i')
          }
        },
        {
          'Role In Case': {
            '$regex' : new RegExp('', 'i')
          }
        }]
    }
  },
  Source: {
    type: 'find',
    value: {
      '$and': [
        {
          'Full Name': {
            '$regex' : new RegExp('', 'i')
          }
        },
        {
          'Type': {
            '$regex' : new RegExp('', 'i')
          }
        }]
    }
  }
};

module.exports = filterTransforms;

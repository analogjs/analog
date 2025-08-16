import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import type { WithContext, Event } from 'schema-dts';

// Export JSON-LD for the route tree
export const routeJsonLd: WithContext<Event> = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'AnalogJS Conference 2024',
  description: 'The premier conference for AnalogJS developers',
  startDate: '2024-06-15T09:00:00-07:00',
  endDate: '2024-06-17T18:00:00-07:00',
  location: {
    '@type': 'Place',
    name: 'San Francisco Convention Center',
    address: {
      '@type': 'PostalAddress',
      streetAddress: '747 Howard St',
      addressLocality: 'San Francisco',
      addressRegion: 'CA',
      postalCode: '94103',
      addressCountry: 'US',
    },
  },
  organizer: {
    '@type': 'Organization',
    name: 'AnalogJS Foundation',
    url: 'https://analogjs.org',
  },
  offers: {
    '@type': 'Offer',
    url: 'https://analogjs.org/conf/tickets',
    price: '299',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    validFrom: '2024-01-01T00:00:00-07:00',
  },
  performer: {
    '@type': 'Person',
    name: 'Brandon Roberts',
    jobTitle: 'Creator of AnalogJS',
  },
};

@Component({
  selector: 'app-event',
  standalone: true,
  template: `
    <div class="event-page">
      <h1>AnalogJS Conference 2024</h1>

      <div class="event-info">
        <div class="date-location">
          <h2>📅 June 15-17, 2024</h2>
          <p>📍 San Francisco Convention Center</p>
        </div>

        <div class="description">
          <p>Join us for the premier conference for AnalogJS developers!</p>
          <ul>
            <li>3 days of workshops and talks</li>
            <li>Meet the creators and core team</li>
            <li>Network with the community</li>
            <li>Learn best practices and new features</li>
          </ul>
        </div>

        <div class="ticket-info">
          <h2>Early Bird Tickets</h2>
          <p class="price">$299</p>
          <button class="register-btn">Register Now</button>
        </div>
      </div>

      <section class="speakers">
        <h2>Featured Speaker</h2>
        <div class="speaker">
          <h3>Brandon Roberts</h3>
          <p>Creator of AnalogJS</p>
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .event-page {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
      }

      .event-info {
        background: #f8f9fa;
        padding: 2rem;
        border-radius: 8px;
        margin: 2rem 0;
      }

      .date-location h2 {
        color: #007bff;
        margin-bottom: 0.5rem;
      }

      .price {
        font-size: 2.5rem;
        font-weight: bold;
        color: #28a745;
      }

      .register-btn {
        background: #007bff;
        color: white;
        border: none;
        padding: 1rem 2rem;
        font-size: 1.2rem;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 1rem;
      }

      .register-btn:hover {
        background: #0056b3;
      }

      .speakers {
        margin-top: 3rem;
      }

      .speaker {
        background: #e9ecef;
        padding: 1rem;
        border-radius: 4px;
      }
    `,
  ],
})
export default class EventPageComponent {}
